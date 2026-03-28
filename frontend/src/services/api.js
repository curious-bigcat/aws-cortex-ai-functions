const API_BASE = import.meta.env.VITE_API_URL || "";

async function getAuthHeaders() {
  try {
    const { fetchAuthSession } = await import("aws-amplify/auth");
    const session = await fetchAuthSession();
    const token = session.tokens?.idToken?.toString();
    if (token) {
      return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    }
  } catch (e) {
    console.warn("Auth session not available, using unauthenticated mode");
  }
  return { "Content-Type": "application/json" };
}

export async function queryAgent(message, threadId = null) {
  const headers = await getAuthHeaders();
  const body = { message };
  if (threadId) body.thread_id = threadId;

  const res = await fetch(`${API_BASE}/api/agent/query`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Agent query failed: ${res.status} - ${err}`);
  }

  return res.json();
}

export async function getPresignedUploadUrl(filename, contentType) {
  const headers = await getAuthHeaders();

  const res = await fetch(`${API_BASE}/api/upload/presigned`, {
    method: "POST",
    headers,
    body: JSON.stringify({ filename, content_type: contentType }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Presigned URL failed: ${res.status} - ${err}`);
  }

  return res.json();
}

export async function uploadFileToS3(file) {
  const prefix = file.type === "application/pdf" ? "documents/" : "audio/";
  const key = prefix + file.name;

  const { upload_url } = await getPresignedUploadUrl(key, file.type);

  const uploadRes = await fetch(upload_url, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });

  if (!uploadRes.ok) {
    throw new Error(`S3 upload failed: ${uploadRes.status}`);
  }

  return { key, status: "uploaded" };
}
