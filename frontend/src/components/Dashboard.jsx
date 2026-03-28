import React, { useState } from "react";
import { queryAgent } from "../services/api";
import ReactMarkdown from "react-markdown";

const DASHBOARD_QUERIES = [
  { label: "Patient Demographics", query: "Show me a breakdown of patients by gender and age group" },
  { label: "Revenue by Department", query: "What is the total revenue by department for the current year?" },
  { label: "Common Diagnoses", query: "What are the top 10 most common diagnoses?" },
  { label: "Appointment Volume", query: "Show me the monthly appointment volume trend" },
  { label: "Billing Status", query: "What is the distribution of billing statuses (paid, pending, overdue)?" },
  { label: "Top Medications", query: "What are the most frequently prescribed medications?" },
];

export default function Dashboard() {
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState({});

  async function runQuery(idx) {
    const q = DASHBOARD_QUERIES[idx];
    setLoading(prev => ({ ...prev, [idx]: true }));
    try {
      const res = await queryAgent(q.query);
      setResults(prev => ({ ...prev, [idx]: res.text || res.response || "No response" }));
    } catch (err) {
      setResults(prev => ({ ...prev, [idx]: `Error: ${err.message}` }));
    } finally {
      setLoading(prev => ({ ...prev, [idx]: false }));
    }
  }

  function runAll() {
    DASHBOARD_QUERIES.forEach((_, i) => {
      if (!results[i] && !loading[i]) runQuery(i);
    });
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h2>Healthcare Analytics Dashboard</h2>
        <button className="btn-primary" onClick={runAll}>Load All Widgets</button>
      </div>

      <div className="dashboard-grid">
        {DASHBOARD_QUERIES.map((q, i) => (
          <div key={i} className="dashboard-card">
            <div className="card-header">
              <h3>{q.label}</h3>
              {!loading[i] && (
                <button className="btn-icon" onClick={() => runQuery(i)} title="Refresh">&#x21bb;</button>
              )}
            </div>
            <div className="card-body">
              {loading[i] ? (
                <div className="card-loading"><div className="spinner" /></div>
              ) : results[i] ? (
                <ReactMarkdown>{results[i]}</ReactMarkdown>
              ) : (
                <p className="card-placeholder">Click refresh or Load All to populate</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
