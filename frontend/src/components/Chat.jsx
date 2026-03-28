import React, { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { queryAgent } from "../services/api";

const SUGGESTED_QUESTIONS = [
  "What are the most common diagnoses this year?",
  "Show me revenue by department",
  "Summarize recent patient intake documents",
  "Which patients have chronic conditions?",
  "What are the top prescribed medications?",
];

export default function Chat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [threadId, setThreadId] = useState(null);
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(text) {
    const userMsg = { role: "user", content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await queryAgent(text, threadId);
      if (res.thread_id) setThreadId(res.thread_id);

      const assistantMsg = {
        role: "assistant",
        content: res.text || res.response || "No response received.",
        citations: res.citations || [],
        charts: res.charts || [],
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      setMessages(prev => [...prev, { role: "error", content: err.message }]);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!input.trim() || loading) return;
    sendMessage(input.trim());
  }

  function handleSuggestion(q) {
    if (loading) return;
    sendMessage(q);
  }

  function startNewThread() {
    setMessages([]);
    setThreadId(null);
  }

  return (
    <div className="chat-container">
      <div className="chat-header">
        <h2>Healthcare AI Agent</h2>
        <button className="btn-secondary" onClick={startNewThread}>New Conversation</button>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-welcome">
            <h3>Ask me anything about your healthcare data</h3>
            <p>I can query structured data (patients, billing, appointments) and search through unstructured documents (intake forms, lab reports, transcriptions).</p>
            <div className="suggestions">
              {SUGGESTED_QUESTIONS.map((q, i) => (
                <button key={i} className="suggestion-chip" onClick={() => handleSuggestion(q)}>{q}</button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`chat-bubble ${msg.role}`}>
            {msg.role === "user" && <div className="bubble-label">You</div>}
            {msg.role === "assistant" && <div className="bubble-label">Healthcare AI</div>}
            {msg.role === "error" && <div className="bubble-label error-label">Error</div>}

            <div className="bubble-content">
              {msg.role === "assistant" ? (
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              ) : (
                <p>{msg.content}</p>
              )}
            </div>

            {msg.citations?.length > 0 && (
              <div className="citations">
                <strong>Sources:</strong>
                <ul>
                  {msg.citations.map((c, j) => (
                    <li key={j}>{c.source_file || c.title || `Source ${j + 1}`}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="chat-bubble assistant">
            <div className="bubble-label">Healthcare AI</div>
            <div className="bubble-content typing">
              <span></span><span></span><span></span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form className="chat-input" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Ask about patients, billing, documents, or anything healthcare..."
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={loading}
        />
        <button type="submit" className="btn-primary" disabled={loading || !input.trim()}>Send</button>
      </form>
    </div>
  );
}
