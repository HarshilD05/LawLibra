/**
 * LawLibra — API Client
 * Perfectly matched to the real backend running on port 3000
 * All routes: /api/auth, /api/cases, /api/folders, /api/documents, /api/chat/threads
 */

const BASE_URL = "http://localhost:3000/api";

// ─── Token Helpers ───────────────────────────────────────────
const getToken  = ()       => localStorage.getItem("ll_token");
const getUser   = ()       => { try { return JSON.parse(localStorage.getItem("ll_user") || "{}"); } catch { return {}; } };
const isAdmin   = ()       => getUser()?.role === "ADMIN";
const setAuth   = (t, u)  => { localStorage.setItem("ll_token", t); localStorage.setItem("ll_user", JSON.stringify(u)); };
const clearAuth = ()       => { localStorage.removeItem("ll_token"); localStorage.removeItem("ll_user"); };

// ─── Base Fetch ──────────────────────────────────────────────
async function api(method, path, body = null, isForm = false) {
  const headers = { Authorization: `Bearer ${getToken()}` };
  if (!isForm) headers["Content-Type"] = "application/json";
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body ? (isForm ? body : JSON.stringify(body)) : null,
    });
    if (res.status === 401) { clearAuth(); window.location.href = "login_page.html"; return; }
    return await res.json();
  } catch (err) {
    console.error(`[API Error] ${method} ${path}:`, err);
    throw err;
  }
}

// ─── AUTH ────────────────────────────────────────────────────
const Auth = {
  login: (email, password) =>
    fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }).then(r => r.json()),

  getMe:          ()                              => api("GET",    "/auth/me"),
  changePassword: (currentPassword, newPassword)  => api("PATCH",  "/auth/change-password", { currentPassword, newPassword }),
  // Admin only:
  getUsers:       (limit = 20, offset = 0)        => api("GET",    `/auth/users?limit=${limit}&offset=${offset}`),
  getUserById:    (id)                            => api("GET",    `/auth/users/${id}`),
  registerUser:   (name, email, password, role)   => api("POST",   "/auth/register", { name, email, password, role }),
  deleteUser:     (id)                            => api("DELETE", `/auth/users/${id}`),
};

// ─── CASES ───────────────────────────────────────────────────
const Cases = {
  list:             (status = "", limit = 20, offset = 0) =>
    api("GET", `/cases?limit=${limit}&offset=${offset}${status ? "&status=" + status : ""}`),
  getById:          (id)                                  => api("GET",    `/cases/${id}`),
  create:           (data)                                => api("POST",   "/cases", data),
  update:           (id, data)                            => api("PATCH",  `/cases/${id}`, data),
  delete:           (id)                                  => api("DELETE", `/cases/${id}`),
  getAssignments:   (caseId)                              => api("GET",    `/cases/${caseId}/assignments`),
  assignLawyer:     (caseId, lawyerId, accessLevel)       => api("POST",   `/cases/${caseId}/assignments`, { lawyerId, accessLevel }),
  removeAssignment: (caseId, lawyerId)                    => api("DELETE", `/cases/${caseId}/assignments/${lawyerId}`),
};

// ─── FOLDERS ─────────────────────────────────────────────────
const Folders = {
  getTree: (caseId)                           => api("GET",    `/folders/tree?caseId=${caseId}`),
  getById: (id)                               => api("GET",    `/folders/${id}`),
  create:  (caseId, name, parentFolderId)     => api("POST",   "/folders", { caseId, name, parentFolderId: parentFolderId || null }),
  rename:  (id, name)                         => api("PATCH",  `/folders/${id}`, { name }),
  delete:  (id)                               => api("DELETE", `/folders/${id}`),
};

// ─── DOCUMENTS ───────────────────────────────────────────────
const Documents = {
  list: (caseId, folderId = null, limit = 20, offset = 0) => {
    let url = `/documents?caseId=${caseId}&limit=${limit}&offset=${offset}`;
    if (folderId) url += `&folderId=${folderId}`;
    return api("GET", url);
  },
  getById:    (id)        => api("GET",    `/documents/${id}`),
  getChunks:  (id)        => api("GET",    `/documents/${id}/chunks`),
  delete:     (id)        => api("DELETE", `/documents/${id}`),
  upload: (caseId, folderId, file) => {
    const form = new FormData();
    form.append("document", file);
    form.append("caseId", caseId);
    if (folderId) form.append("folderId", folderId);
    return api("POST", "/documents/upload", form, true);
  },
};

// ─── CHAT (AI) ───────────────────────────────────────────────
const Chat = {
  listThreads:  (caseId)                        => api("GET",    `/chat/threads?caseId=${caseId}`),
  getThread:    (id)                            => api("GET",    `/chat/threads/${id}`),
  createThread: (caseId, title)                 => api("POST",   "/chat/threads", { caseId, title }),
  renameThread: (id, title)                     => api("PATCH",  `/chat/threads/${id}`, { title }),
  deleteThread: (id)                            => api("DELETE", `/chat/threads/${id}`),
  getMessages:  (threadId, limit = 50, offset = 0) => api("GET", `/chat/threads/${threadId}/messages?limit=${limit}&offset=${offset}`),
  sendMessage:  (threadId, content)             => api("POST",   `/chat/threads/${threadId}/messages`, { content }),
};

// ─── CALENDAR (to be added to backend) ───────────────────────
const Calendar = {
  getEvents:   ()     => api("GET",    "/calendar"),
  createEvent: (data) => api("POST",   "/calendar", data),
  deleteEvent: (id)   => api("DELETE", `/calendar/${id}`),
  // Get hearing dates directly from cases metadata (works RIGHT NOW, no new backend needed)
  getHearingsFromCases: async () => {
    const result = await Cases.list("OPEN", 100);
    return (result?.data || [])
      .filter(c => c.metadata?.nextHearing)
      .map(c => ({
        id: c.id,
        title: c.title,
        date: c.metadata.nextHearing,
        type: "HEARING",
        clientName: c.clientName,
        courtName: c.courtName,
      }));
  },
};

// ─── NOTIFICATIONS (to be added to backend) ──────────────────
const Notifications = {
  getAll:      ()   => api("GET",   "/notifications"),
  markRead:    (id) => api("PATCH", `/notifications/${id}/read`),
  markAllRead: ()   => api("PATCH", "/notifications/read-all"),
};

// ─── Expose Globally ─────────────────────────────────────────
window.LawLibra = {
  Auth, Cases, Folders, Documents, Chat, Calendar, Notifications,
  getUser, isAdmin, setAuth, clearAuth, getToken,
};
