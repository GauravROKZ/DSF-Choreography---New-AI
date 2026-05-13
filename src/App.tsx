/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { User } from '@/types';
import Navbar from '@/components/Navbar';
import Login from '@/components/Login';
import Dashboard from '@/components/Dashboard';
import CheckInForm from '@/components/CheckInForm';
import AdminDashboard from '@/components/AdminDashboard';
import ManagementDashboard from '@/components/ManagementDashboard';
import HistoryView from '@/components/HistoryView';
import Toast from '@/components/Toast';
import Sidebar from '@/components/Sidebar';
import { AnimatePresence } from 'motion/react';

type View = 'login' | 'dashboard' | 'form' | 'admin' | 'history' | 'management';
type ManagementSubView = 'home' | 'choreography' | 'performance' | 'admin';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState<View>('login');
  const [managementSubView, setManagementSubView] = useState<ManagementSubView>('home');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [selectedRM, setSelectedRM] = useState<{ user: User; isUpdate: boolean } | null>(null);
  const [team, setTeam] = useState<User[]>([]);
  const [toast, setToastInfo] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastDate, setLastDate] = useState(new Date().toDateString());

  useEffect(() => {
    const interval = setInterval(() => {
      const today = new Date().toDateString();
      if (today !== lastDate) {
        setLastDate(today);
        setRefreshKey(prev => prev + 1);
        if (currentUser) {
          if (isManagement(currentUser.role)) {
            // No direct team fetch needed for management usually as it fetches its own
          } else {
            fetchTeam(currentUser.user_id);
          }
        }
      }
    }, 60000); // Check once a minute
    return () => clearInterval(interval);
  }, [lastDate, currentUser]);

  const setToast = (msg: string, type: 'ok' | 'err') => {
    setToastInfo({ msg, type });
  };

  const isManagement = (role?: string) => {
    if (!role) return false;
    const r = role.toUpperCase();
    const managementRoles = ['ASM', 'BM', 'ZM', 'BM (T)', 'REGIONAL MANAGER', 'AREA MANAGER', 'ZSM', 'ZH', 'HO', 'HEAD', 'SM'];
    return managementRoles.some(m => r.includes(m)) || r.includes('MANAGER');
  };

  const isHighLevel = (role?: string) => {
    if (!role) return false;
    const r = role.toUpperCase();
    return ['HO', 'HEAD', 'ZH', 'ZSM'].some(m => r.includes(m));
  };

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    const role = user.role.toUpperCase();
    const isHOHead = role.includes('HO') || role.includes('HEAD');
    
    // Management roles go to the consolidated dashboard
    if (isManagement(user.role)) {
      setCurrentView('management');
      setManagementSubView('home'); 
      fetchTeam(user.user_id); // Sync team for history view
    } else if (role === 'ADMIN') {
      setCurrentView('admin');
    } else {
      setCurrentView('dashboard');
      fetchTeam(user.user_id);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setCurrentView('login');
    setSelectedRM(null);
    setTeam([]);
  };

  const fetchTeam = async (smId: string) => {
    try {
      const response = await fetch(`/api/dashboard?smId=${smId}`);
      if (!response.ok) return;
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") !== -1) {
        const data = await response.json();
        if (data.team) setTeam(data.team as User[]);
      }
    } catch (err) {
      setToast('Failed to sync team', 'err');
    }
  };

  const navigateToDashboard = () => {
    setRefreshKey(prev => prev + 1);

    if (currentUser && isManagement(currentUser.role)) {
      setCurrentView('management');
      setManagementSubView('home');
    } else {
      setCurrentView('dashboard');
    }
  };

  return (
    <div className="min-h-screen pb-20">
      <Navbar 
        user={currentUser} 
        onLogout={handleLogout} 
        onOpenSidebar={() => setIsSidebarOpen(true)}
        onSelectView={(v) => {
          setCurrentView('management');
          setManagementSubView(v as any);
        }}
      />

      <Sidebar 
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        user={currentUser}
        currentSubView={managementSubView}
        onSelectView={(v) => {
          if (v === 'admin') {
            setCurrentView('admin');
          } else if (v === 'history') {
            setCurrentView('history');
          } else {
            setCurrentView('management');
            setManagementSubView(v);
          }
        }}
        onLogout={handleLogout}
      />

      <main className="container mx-auto px-4">
        {currentView === 'login' && (
          <Login onLogin={handleLogin} setToast={setToast} />
        )}

        {currentView === 'dashboard' && currentUser && (
          <Dashboard 
            user={currentUser} 
            onSelectRM={(rm, isUpdate) => {
              setSelectedRM({ user: rm, isUpdate });
              setCurrentView('form');
            }}
            onViewHistory={() => setCurrentView('history')}
            setToast={setToast}
            refreshKey={refreshKey}
          />
        )}

        {currentView === 'management' && currentUser && (
          <ManagementDashboard 
            user={currentUser} 
            setToast={setToast} 
            mode={managementSubView}
            onSelectMember={(member, isUpdate) => {
              setSelectedRM({ user: member, isUpdate }); 
              setCurrentView('form');
            }}
            refreshKey={refreshKey}
            onSwitchToAdmin={() => setCurrentView('admin')}
          />
        )}

        {currentView === 'form' && currentUser && selectedRM && (
          <CheckInForm 
            user={currentUser} 
            rm={selectedRM.user}
            isUpdate={selectedRM.isUpdate}
            onBack={navigateToDashboard}
            setToast={setToast}
          />
        )}

        {currentView === 'admin' && (
          <AdminDashboard 
            setToast={setToast} 
            onBack={() => {
              if (isManagement(currentUser?.role)) {
                setCurrentView('management');
              } else {
                handleLogout(); // Should not happen but safety
              }
            }}
          />
        )}

        {currentView === 'history' && currentUser && (
          <HistoryView 
            user={currentUser}
            team={team}
            onBack={navigateToDashboard}
            setToast={setToast}
            refreshKey={refreshKey}
          />
        )}
      </main>

      <footer className="w-full py-8 text-center border-t border-slate-100 mt-10">
        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">
          Built with <span className="text-brand-crimson">❤️</span> by Gaurav Lahoti
        </p>
      </footer>

      <AnimatePresence>
        {toast && (
          <Toast 
            message={toast.msg} 
            type={toast.type} 
            onClose={() => setToastInfo(null)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}
