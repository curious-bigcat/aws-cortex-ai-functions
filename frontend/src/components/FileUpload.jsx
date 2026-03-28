import React, { useState, useRef } from "react";
import { uploadFileToS3 } from "../services/api";

const ACCEPTED_TYPES = {
  "application/pdf": "PDF Document",
  "audio/wav": "WAV Audio",
  "audio/x-wav": "WAV Audio",
  "audio/wave": "WAV Audio",
};

export default function FileUpload() {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState([]);
  const inputRef = useRef(null);

  function handleDrop(e) {
    e.preventDefault();
    addFiles(Array.from(e.dataTransfer.files));
  }

  function handleSelect(e) {
    addFiles(Array.from(e.target.files));
    e.target.value = "";
  }

  function addFiles(newFiles) {
    const valid = newFiles.filter(f => Object.keys(ACCEPTED_TYPES).includes(f.type));
    if (valid.length < newFiles.length) {
      alert("Only PDF and WAV files are accepted. Some files were skipped.");
    }
    setFiles(prev => [...prev, ...valid]);
  }

  function removeFile(idx) {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  }

  async function handleUpload() {
    if (files.length === 0) return;
    setUploading(true);
    setUploadResults([]);

    const results = [];
    for (const file of files) {
      try {
        const res = await uploadFileToS3(file);
        results.push({ name: file.name, status: "success", key: res.key });
      } catch (err) {
        results.push({ name: file.name, status: "error", error: err.message });
      }
    }

    setUploadResults(results);
    setFiles([]);
    setUploading(false);
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  return (
    <div className="upload-container">
      <h2>Upload Healthcare Files</h2>
      <p className="upload-desc">
        Upload PDF documents (intake forms, lab reports, discharge summaries) or WAV audio files
        (doctor dictation, patient calls). Files are processed automatically by Snowflake Cortex AI.
      </p>

      <div
        className="drop-zone"
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
      >
        <div className="drop-icon">+</div>
        <p>Drag & drop files here, or click to browse</p>
        <p className="drop-hint">Accepted: PDF, WAV</p>
        <input ref={inputRef} type="file" multiple accept=".pdf,.wav" onChange={handleSelect} hidden />
      </div>

      {files.length > 0 && (
        <div className="file-list">
          <h3>Selected Files ({files.length})</h3>
          <ul>
            {files.map((f, i) => (
              <li key={i}>
                <span className="file-type-badge">{f.type.includes("pdf") ? "PDF" : "WAV"}</span>
                <span className="file-name">{f.name}</span>
                <span className="file-size">{formatSize(f.size)}</span>
                <button className="btn-remove" onClick={() => removeFile(i)}>x</button>
              </li>
            ))}
          </ul>
          <button className="btn-primary" onClick={handleUpload} disabled={uploading}>
            {uploading ? "Uploading..." : `Upload ${files.length} file(s)`}
          </button>
        </div>
      )}

      {uploadResults.length > 0 && (
        <div className="upload-results">
          <h3>Upload Results</h3>
          <ul>
            {uploadResults.map((r, i) => (
              <li key={i} className={`result-${r.status}`}>
                <span>{r.name}</span>
                <span>{r.status === "success" ? "Uploaded" : r.error}</span>
              </li>
            ))}
          </ul>
          <p className="processing-note">
            Files will be automatically processed by the AI pipeline. Check the Agent Chat for insights.
          </p>
        </div>
      )}
    </div>
  );
}
