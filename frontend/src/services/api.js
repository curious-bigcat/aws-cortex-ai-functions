const API_BASE = import.meta.env.VITE_API_URL || "/api";

export async function queryAgent(message, threadId = null) {
  const body = { message };
  if (threadId) body.thread_id = threadId;

  const res = await fetch(`${API_BASE}/agent/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Agent query failed: ${res.status} - ${err}`);
  }

  return res.json();
}

export async function uploadFileToS3(file) {
  const fileType = file.name.split(".").pop().toLowerCase();
  const res = await fetch(`${API_BASE}/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: file.name, fileType }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Presigned URL failed: ${res.status} - ${err}`);
  }

  const { uploadUrl, key } = await res.json();

  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });

  if (!uploadRes.ok) {
    throw new Error(`S3 upload failed: ${uploadRes.status}`);
  }

  return { key, status: "uploaded" };
}
