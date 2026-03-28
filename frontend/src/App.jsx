import React from "react";
import { Routes, Route, Navigate, NavLink } from "react-router-dom";
import Chat from "./components/Chat";
import Dashboard from "./components/Dashboard";
import FileUpload from "./components/FileUpload";

export default function App() {
  return (
    <div className="app-layout">
      <nav className="sidebar">
        <div className="sidebar-header">
          <h2>Healthcare AI</h2>
          <span className="user-badge">Demo User</span>
        </div>
        <ul className="nav-links">
          <li><NavLink to="/chat">Agent Chat</NavLink></li>
          <li><NavLink to="/dashboard">Dashboard</NavLink></li>
          <li><NavLink to="/upload">Upload Files</NavLink></li>
        </ul>
      </nav>
      <main className="main-content">
        <Routes>
          <Route path="/chat" element={<Chat />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/upload" element={<FileUpload />} />
          <Route path="*" element={<Navigate to="/chat" replace />} />
        </Routes>
      </main>
    </div>
  );
}
