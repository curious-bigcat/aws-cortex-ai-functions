import React, { useState, useEffect } from "react";
import { Routes, Route, Navigate, NavLink } from "react-router-dom";
import { getCurrentUser, signOut } from "./services/auth";
import Login from "./components/Login";
import Chat from "./components/Chat";
import Dashboard from "./components/Dashboard";
import FileUpload from "./components/FileUpload";

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkUser();
  }, []);

  async function checkUser() {
    try {
      const u = await getCurrentUser();
      setUser(u);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    setUser(null);
  }

  if (loading) {
    return <div className="loading-screen"><div className="spinner" /><p>Loading...</p></div>;
  }

  if (!user) {
    return <Login onSignIn={checkUser} />;
  }

  return (
    <div className="app-layout">
      <nav className="sidebar">
        <div className="sidebar-header">
          <h2>Healthcare AI</h2>
          <span className="user-badge">{user.signInDetails?.loginId || user.username}</span>
        </div>
        <ul className="nav-links">
          <li><NavLink to="/chat">Agent Chat</NavLink></li>
          <li><NavLink to="/dashboard">Dashboard</NavLink></li>
          <li><NavLink to="/upload">Upload Files</NavLink></li>
        </ul>
        <button className="btn-signout" onClick={handleSignOut}>Sign Out</button>
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
