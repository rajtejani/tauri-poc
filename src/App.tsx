import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { Sidebar } from './renderer/components/Sidebar';
import { DashboardPage } from './renderer/pages/DashboardPage';
import { TasksPage } from './renderer/pages/TasksPage';
import { DevicesPage } from './renderer/pages/DevicesPage';
import { LogsPage } from './renderer/pages/LogsPage';
import { PrintersPage } from './renderer/pages/PrintersPage';
import { useAppBootstrap } from './renderer/hooks/useAppBootstrap';
import { UpdateToast } from './renderer/components/UpdateToast';

function AppLayout() {
  useAppBootstrap();

  return (
    <div className="flex h-screen overflow-hidden bg-surface text-slate-800">
      <Sidebar />
      <main className="flex flex-1 flex-col overflow-hidden">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/devices" element={<DevicesPage />} />
          <Route path="/printers" element={<PrintersPage />} />
          <Route path="/logs" element={<LogsPage />} />
        </Routes>
      </main>
      <UpdateToast />
    </div>
  );
}

export default AppLayout;
