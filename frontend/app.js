/**
 * LawLibra — app.js
 * Complete frontend-only engine: auth, state, mock DB, toasts, dark mode, CRUD
 * No backend required. Everything runs in localStorage + sessionStorage.
 */

(function (window) {
  "use strict";

  /* ═══════════════════════════════════════════════════════════
     SECTION 1: UTILITIES
  ═══════════════════════════════════════════════════════════ */

  const Utils = {
    delay: (ms = 600) => new Promise(res => setTimeout(res, ms + Math.random() * 200)),
    hashPassword: (pw) => {
      let hash = 0;
      const salt = "LL_SOVEREIGN_2024";
      const str = pw + salt;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
      }
      return hash.toString(36);
    },
    uid: () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    fmtDate: (iso) => {
      if (!iso) return "—";
      const d = new Date(iso);
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    },
    fmtDateTime: (iso) => {
      if (!iso) return "—";
      const d = new Date(iso);
      return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    },
    initials: (name) => (name || "U").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase(),
    statusBadge: (status) => {
      const map = {
        OPEN:     "bg-emerald-100 text-emerald-700 border border-emerald-200",
        CLOSED:   "bg-slate-100 text-slate-600 border border-slate-200",
        ARCHIVED: "bg-amber-100 text-amber-700 border border-amber-200",
        PENDING:  "bg-blue-100 text-blue-700 border border-blue-200",
      };
      const cls = map[status] || map.PENDING;
      return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold ${cls}">${status}</span>`;
    },
    clone: (obj) => JSON.parse(JSON.stringify(obj)),
    esc: (str) => String(str || "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])),
    relTime: (iso) => {
      const diff = Date.now() - new Date(iso).getTime();
      const m = Math.floor(diff / 60000);
      if (m < 1)  return "just now";
      if (m < 60) return `${m}m ago`;
      const h = Math.floor(m / 60);
      if (h < 24) return `${h}h ago`;
      return `${Math.floor(h / 24)}d ago`;
    },
    fmtFileSize: (bytes) => {
      if (bytes < 1024) return bytes + " B";
      if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
      return (bytes / 1048576).toFixed(1) + " MB";
    }
  };

  /* ═══════════════════════════════════════════════════════════
     SECTION 2: STORAGE LAYER
  ═══════════════════════════════════════════════════════════ */

  const Store = {
    get: (key) => { try { return JSON.parse(localStorage.getItem("ll_" + key)); } catch { return null; } },
    set: (key, val) => localStorage.setItem("ll_" + key, JSON.stringify(val)),
    del: (key) => localStorage.removeItem("ll_" + key),
    session: {
      get: (key) => { try { return JSON.parse(sessionStorage.getItem("ll_" + key)); } catch { return null; } },
      set: (key, val) => sessionStorage.setItem("ll_" + key, JSON.stringify(val)),
    }
  };

  /* ═══════════════════════════════════════════════════════════
     SECTION 3: SEED DATA
  ═══════════════════════════════════════════════════════════ */

  const SEED = {
    users: [
      { id: "u001", name: "Julian Sterling, Esq.", email: "admin@lawlibra.pro", passwordHash: Utils.hashPassword("Admin@123"), role: "ADMIN",  createdAt: "2024-01-15T09:00:00Z", active: true },
      { id: "u002", name: "Sophia Hartwell",       email: "lawyer@lawlibra.pro", passwordHash: Utils.hashPassword("Lawyer@123"), role: "LAWYER", createdAt: "2024-02-10T10:00:00Z", active: true },
      { id: "u003", name: "Marcus Chen, J.D.",     email: "marcus@lawlibra.pro", passwordHash: Utils.hashPassword("Marcus@123"), role: "LAWYER", createdAt: "2024-03-05T11:00:00Z", active: true },
    ],
    cases: [
      { id: "c001", title: "Sterling v. Apex Corp",            clientName: "Sterling Industries LLC",   type: "Intellectual Property",  status: "OPEN",     courtName: "US District Court, SDNY",    caseNumber: "IP-2024-1847", assignedTo: ["u001","u002"], nextHearing: "2025-01-15T10:00:00Z", filedAt: "2024-03-10T09:00:00Z", description: "Alleged trade secret misappropriation and patent infringement involving proprietary manufacturing processes.", priority: "HIGH" },
      { id: "c002", title: "Peterson vs. Global Logistics",    clientName: "David R. Peterson",          type: "Contract Dispute",       status: "OPEN",     courtName: "State Court, NY Div 4",      caseNumber: "CD-2024-0392", assignedTo: ["u002"],         nextHearing: "2025-01-22T11:30:00Z", filedAt: "2024-04-22T10:00:00Z", description: "Breach of contract claim regarding unfulfilled logistics agreement worth $2.3M.", priority: "MEDIUM" },
      { id: "c003", title: "State of NY vs. Jameson",          clientName: "Robert Jameson",             type: "Criminal Defense",       status: "OPEN",     courtName: "NY Supreme Court",           caseNumber: "CR-2024-0817", assignedTo: ["u001","u003"], nextHearing: "2025-02-05T09:00:00Z", filedAt: "2024-05-18T14:00:00Z", description: "Defense of white-collar fraud charges involving alleged securities violations.", priority: "HIGH" },
      { id: "c004", title: "Miller Corp Tax Audit",            clientName: "Miller Corporation",         type: "Tax Law",                status: "OPEN",     courtName: "US Tax Court",               caseNumber: "TX-2024-2244", assignedTo: ["u002","u003"], nextHearing: "2025-01-09T09:00:00Z", filedAt: "2024-06-01T09:00:00Z", description: "IRS audit defense for Miller Corp regarding $4.7M in disputed deductions.", priority: "HIGH" },
      { id: "c005", title: "TechNova IP v. ByteCore",          clientName: "TechNova Inc.",              type: "Intellectual Property",  status: "OPEN",     courtName: "Federal Court, NDCA",        caseNumber: "IP-2024-3301", assignedTo: ["u001"],         nextHearing: "2025-02-20T13:00:00Z", filedAt: "2024-07-14T10:00:00Z", description: "Patent infringement suit involving AI-generated content processing algorithms.", priority: "MEDIUM" },
      { id: "c006", title: "Hartwell Estate Dispute",          clientName: "Victoria Hartwell",          type: "Probate & Estates",      status: "CLOSED",   courtName: "Surrogate Court, NY",        caseNumber: "PE-2023-1102", assignedTo: ["u002"],         nextHearing: null,                    filedAt: "2023-09-05T09:00:00Z", description: "Contested will and estate distribution involving assets over $12M.", priority: "LOW" },
      { id: "c007", title: "ClearPath v. Summit Ventures",     clientName: "ClearPath Financial",        type: "Corporate",              status: "ARCHIVED", courtName: "Delaware Chancery Court",    caseNumber: "CO-2023-0528", assignedTo: ["u001","u002"], nextHearing: null,                    filedAt: "2023-05-20T10:00:00Z", description: "Shareholder derivative action regarding fiduciary duty breaches.", priority: "LOW" },
    ],
    documents: [
      { id: "d001", name: "Affidavit_Sterling_2024.pdf",      caseId: "c001", size: 245760,  type: "pdf",  uploadedBy: "u001", uploadedAt: "2024-08-15T10:30:00Z", tags: ["affidavit","evidence"] },
      { id: "d002", name: "Patent_Application_TechNova.pdf",  caseId: "c001", size: 1048576, type: "pdf",  uploadedBy: "u002", uploadedAt: "2024-09-01T14:00:00Z", tags: ["patent","application"] },
      { id: "d003", name: "Contract_GlobalLogistics.docx",    caseId: "c002", size: 184320,  type: "docx", uploadedBy: "u002", uploadedAt: "2024-09-10T09:00:00Z", tags: ["contract","exhibit"] },
      { id: "d004", name: "Exhibit_B_Miller_Testimony.pdf",   caseId: "c004", size: 512000,  type: "pdf",  uploadedBy: "u003", uploadedAt: "2024-09-20T11:00:00Z", tags: ["testimony","exhibit"] },
      { id: "d005", name: "Q3_Internal_Report_Doc42.pdf",     caseId: "c004", size: 768000,  type: "pdf",  uploadedBy: "u003", uploadedAt: "2024-09-22T16:00:00Z", tags: ["report","finance"] },
      { id: "d006", name: "Jameson_Defense_Brief.docx",       caseId: "c003", size: 286720,  type: "docx", uploadedBy: "u001", uploadedAt: "2024-10-01T13:00:00Z", tags: ["brief","defense"] },
      { id: "d007", name: "TechNova_Prior_Art_Analysis.pdf",  caseId: "c005", size: 921600,  type: "pdf",  uploadedBy: "u001", uploadedAt: "2024-10-05T10:00:00Z", tags: ["prior-art","analysis"] },
    ],
    events: [
      { id: "e001", title: "IRS Tax Audit: Miller Corp",   caseId: "c004", date: "2025-01-09", time: "09:00", type: "HEARING",  duration: 120, location: "Conference Room B",      createdBy: "u001" },
      { id: "e002", title: "Preliminary Deposition",       caseId: "c002", date: "2025-01-09", time: "11:30", type: "HEARING",  duration: 90,  location: "State Court, Div 4",     createdBy: "u002" },
      { id: "e003", title: "Review Peterson Evidence",     caseId: "c002", date: "2025-01-09", time: "14:00", type: "REMINDER", duration: 45,  location: "Office Desk",            createdBy: "u002" },
      { id: "e004", title: "Sterling v. Apex Pre-trial",  caseId: "c001", date: "2025-01-15", time: "10:00", type: "HEARING",  duration: 180, location: "US District Court, SDNY", createdBy: "u001" },
      { id: "e005", title: "TechNova IP Strategy Call",   caseId: "c005", date: "2025-01-22", time: "14:00", type: "MEETING",  duration: 60,  location: "Zoom",                   createdBy: "u001" },
      { id: "e006", title: "Peterson Hearing",             caseId: "c002", date: "2025-01-22", time: "11:30", type: "HEARING",  duration: 90,  location: "State Court, Div 4",     createdBy: "u002" },
      { id: "e007", title: "Jameson Defense Review",       caseId: "c003", date: "2025-02-05", time: "09:00", type: "HEARING",  duration: 120, location: "NY Supreme Court",        createdBy: "u001" },
      { id: "e008", title: "TechNova IP Hearing",          caseId: "c005", date: "2025-02-20", time: "13:00", type: "HEARING",  duration: 180, location: "Federal Court, NDCA",     createdBy: "u001" },
    ],
    notifications: [
      { id: "n001", userId: "*", title: "Hearing Tomorrow",       message: "Sterling vs. Apex Corp – 10:30 AM",               type: "hearing",  read: false, createdAt: new Date(Date.now() - 3600000).toISOString() },
      { id: "n002", userId: "*", title: "Document Processed",     message: "Affidavit_Sterling_2024.pdf is ready to review",  type: "document", read: false, createdAt: new Date(Date.now() - 10800000).toISOString() },
      { id: "n003", userId: "*", title: "Case Status Updated",    message: "TechNova IP case status changed to OPEN",         type: "case",     read: true,  createdAt: new Date(Date.now() - 86400000).toISOString() },
      { id: "n004", userId: "*", title: "New Assignment",         message: "You have been assigned to Miller Corp Tax Audit", type: "case",     read: true,  createdAt: new Date(Date.now() - 172800000).toISOString() },
      { id: "n005", userId: "*", title: "AI Analysis Ready",      message: "Libra AI completed document analysis for Sterling v. Apex", type: "ai", read: false, createdAt: new Date(Date.now() - 7200000).toISOString() },
    ],
    chatThreads: [
      { id: "t001", caseId: "c004", title: "Miller Tax Strategy",         createdBy: "u001", createdAt: "2024-10-01T10:00:00Z" },
      { id: "t002", caseId: "c003", title: "Jameson Defense Prep",        createdBy: "u001", createdAt: "2024-10-03T14:00:00Z" },
      { id: "t003", caseId: "c001", title: "Sterling IP Analysis",        createdBy: "u002", createdAt: "2024-10-05T09:00:00Z" },
    ],
    chatMessages: [
      { id: "m001", threadId: "t001", role: "user",      content: "Can you analyze the discrepancies in Exhibit B vs. the Q3 Internal Report?", createdAt: "2024-10-01T10:05:00Z" },
      { id: "m002", threadId: "t001", role: "assistant", content: "I have analyzed the relevant sections of **Exhibit B (Miller Testimony)** and the **Q3 Internal Report (Doc-42)**. There is a demonstrable discrepancy of 14 days in her narrative.\n\n**The Conflict:** In Exhibit B (pg. 42, line 12), Miller states she first learned of the shortfall on October 15th. However, metadata and carbon copies in the Q3 Report show she was CC'd on the \"Critical Risk Assessment\" email sent on October 1st.\n\n**Strategic Recommendation:**\n- Confront the witness with the October 1st email timestamp first.\n- Ask her to identify her own signature on the receipt acknowledgment.\n- This establishes a foundation for \"prior knowledge\" which complicates her subsequent denial of intent.", createdAt: "2024-10-01T10:06:00Z" },
    ],
  };

  function seedDatabase() {
    if (!Store.get("db_initialized")) {
      Store.set("users",         SEED.users);
      Store.set("cases",         SEED.cases);
      Store.set("documents",     SEED.documents);
      Store.set("events",        SEED.events);
      Store.set("notifications", SEED.notifications);
      Store.set("chatThreads",   SEED.chatThreads);
      Store.set("chatMessages",  SEED.chatMessages);
      Store.set("db_initialized", true);
    }
  }

  /* ═══════════════════════════════════════════════════════════
     SECTION 4: MOCK DB / CRUD
  ═══════════════════════════════════════════════════════════ */

  const DB = {
    users: {
      all: ()             => Store.get("users") || [],
      byId: (id)          => DB.users.all().find(u => u.id === id),
      byEmail: (email)    => DB.users.all().find(u => u.email.toLowerCase() === email.toLowerCase()),
      save: (users)       => Store.set("users", users),
      create: (data)      => {
        const users = DB.users.all();
        const user = { id: Utils.uid(), ...data, createdAt: new Date().toISOString(), active: true };
        users.push(user);
        DB.users.save(users);
        return user;
      },
      update: (id, patch) => {
        const users = DB.users.all().map(u => u.id === id ? { ...u, ...patch } : u);
        DB.users.save(users);
        return users.find(u => u.id === id);
      },
      delete: (id) => { DB.users.save(DB.users.all().filter(u => u.id !== id)); }
    },
    cases: {
      all: ()            => Store.get("cases") || [],
      byId: (id)         => DB.cases.all().find(c => c.id === id),
      save: (cases)      => Store.set("cases", cases),
      create: (data)     => {
        const cases = DB.cases.all();
        const newCase = { id: Utils.uid(), ...data, filedAt: new Date().toISOString(), assignedTo: data.assignedTo || [] };
        cases.push(newCase);
        DB.cases.save(cases);
        return newCase;
      },
      update: (id, patch) => {
        const cases = DB.cases.all().map(c => c.id === id ? { ...c, ...patch } : c);
        DB.cases.save(cases);
        return cases.find(c => c.id === id);
      },
      delete: (id) => { DB.cases.save(DB.cases.all().filter(c => c.id !== id)); },
      search: (query, status) => {
        let cases = DB.cases.all();
        if (status && status !== "ALL") cases = cases.filter(c => c.status === status);
        if (query) {
          const q = query.toLowerCase();
          cases = cases.filter(c =>
            c.title.toLowerCase().includes(q) ||
            c.clientName.toLowerCase().includes(q) ||
            c.caseNumber.toLowerCase().includes(q) ||
            c.type.toLowerCase().includes(q)
          );
        }
        return cases;
      }
    },
    documents: {
      all: ()             => Store.get("documents") || [],
      byId: (id)          => DB.documents.all().find(d => d.id === id),
      byCaseId: (caseId)  => DB.documents.all().filter(d => d.caseId === caseId),
      save: (docs)        => Store.set("documents", docs),
      create: (data)      => {
        const docs = DB.documents.all();
        const doc = { id: Utils.uid(), ...data, uploadedAt: new Date().toISOString() };
        docs.push(doc);
        DB.documents.save(docs);
        return doc;
      },
      delete: (id) => { DB.documents.save(DB.documents.all().filter(d => d.id !== id)); },
      search: (query, caseId) => {
        let docs = DB.documents.all();
        if (caseId) docs = docs.filter(d => d.caseId === caseId);
        if (query) {
          const q = query.toLowerCase();
          docs = docs.filter(d => d.name.toLowerCase().includes(q) || (d.tags || []).some(t => t.includes(q)));
        }
        return docs;
      }
    },
    folders: {
      all: ()              => Store.get("folders") || [],
      byId: (id)           => DB.folders.all().find(f => f.id === id),
      byCaseId: (caseId)   => DB.folders.all().filter(f => f.caseId === caseId && !f.parentId),
      byParent: (parentId) => DB.folders.all().filter(f => f.parentId === parentId),
      save: (folders)      => Store.set("folders", folders),
      create: (data)       => {
        const folders = DB.folders.all();
        const folder = { id: Utils.uid(), ...data, createdAt: new Date().toISOString() };
        folders.push(folder);
        DB.folders.save(folders);
        return folder;
      },
      rename: (id, name)   => {
        const folders = DB.folders.all().map(f => f.id === id ? { ...f, name } : f);
        DB.folders.save(folders);
      },
      delete: (id)         => {
        // Recursively collect folder ids
        const collectIds = (fid) => {
          const children = DB.folders.all().filter(f => f.parentId === fid).map(f => f.id);
          return [fid, ...children.flatMap(collectIds)];
        };
        const ids = collectIds(id);
        DB.folders.save(DB.folders.all().filter(f => !ids.includes(f.id)));
        DB.documents.save(DB.documents.all().filter(d => !ids.includes(d.folderId)));
      }
    },
    events: {
      all: ()           => Store.get("events") || [],
      byId: (id)        => DB.events.all().find(e => e.id === id),
      save: (evs)       => Store.set("events", evs),
      create: (data)    => {
        const events = DB.events.all();
        const ev = { id: Utils.uid(), ...data, createdAt: new Date().toISOString() };
        events.push(ev);
        DB.events.save(events);
        return ev;
      },
      update: (id, patch) => {
        const events = DB.events.all().map(e => e.id === id ? { ...e, ...patch } : e);
        DB.events.save(events);
        return events.find(e => e.id === id);
      },
      delete: (id) => { DB.events.save(DB.events.all().filter(e => e.id !== id)); },
      forDate: (dateStr) => DB.events.all().filter(e => e.date === dateStr),
      forMonth: (year, month) => DB.events.all().filter(e => {
        const d = new Date(e.date + "T00:00:00");
        return d.getFullYear() === year && d.getMonth() === month;
      })
    },
    notifications: {
      all: (userId)       => (Store.get("notifications") || []).filter(n => n.userId === "*" || n.userId === userId),
      save: (ns)          => Store.set("notifications", ns),
      markRead: (id)      => {
        const ns = (Store.get("notifications") || []).map(n => n.id === id ? { ...n, read: true } : n);
        Store.set("notifications", ns);
      },
      markAllRead: (userId) => {
        const ns = (Store.get("notifications") || []).map(n =>
          (n.userId === "*" || n.userId === userId) ? { ...n, read: true } : n
        );
        Store.set("notifications", ns);
      },
      create: (data) => {
        const ns = Store.get("notifications") || [];
        const n = { id: Utils.uid(), ...data, read: false, createdAt: new Date().toISOString() };
        ns.unshift(n);
        Store.set("notifications", ns);
        return n;
      }
    },
    threads: {
      all: ()              => Store.get("chatThreads") || [],
      byId: (id)           => DB.threads.all().find(t => t.id === id),
      byCaseId: (caseId)   => DB.threads.all().filter(t => t.caseId === caseId),
      save: (threads)      => Store.set("chatThreads", threads),
      create: (data)       => {
        const threads = DB.threads.all();
        const t = { id: Utils.uid(), ...data, createdAt: new Date().toISOString() };
        threads.unshift(t);
        DB.threads.save(threads);
        return t;
      },
      delete: (id) => DB.threads.save(DB.threads.all().filter(t => t.id !== id)),
      rename: (id, title)  => {
        const threads = DB.threads.all().map(t => t.id === id ? { ...t, title } : t);
        DB.threads.save(threads);
      }
    },
    messages: {
      byThread: (threadId) => (Store.get("chatMessages") || []).filter(m => m.threadId === threadId),
      save: (msgs)         => Store.set("chatMessages", msgs),
      create: (data)       => {
        const msgs = Store.get("chatMessages") || [];
        const m = { id: Utils.uid(), ...data, createdAt: new Date().toISOString() };
        msgs.push(m);
        Store.set("chatMessages", msgs);
        return m;
      },
      deleteByThread: (threadId) => {
        Store.set("chatMessages", (Store.get("chatMessages") || []).filter(m => m.threadId !== threadId));
      }
    }
  };

  /* ═══════════════════════════════════════════════════════════
     SECTION 5: AUTHENTICATION
  ═══════════════════════════════════════════════════════════ */

  const Auth = {
    currentUser: () => { try { return JSON.parse(localStorage.getItem("ll_user") || "null"); } catch { return null; } },
    token: () => localStorage.getItem("ll_token"),
    isAdmin: () => (Auth.currentUser()?.role === "ADMIN"),

    login: async (email, password) => {
      await Utils.delay(800);
      const user = DB.users.byEmail(email);
      if (!user) return { error: "No account found with this email." };
      if (!user.active) return { error: "This account has been deactivated." };
      if (user.passwordHash !== Utils.hashPassword(password)) return { error: "Invalid password. Please try again." };
      const token = "ll_tok_" + Utils.uid();
      const { passwordHash: _, ...safeUser } = user;
      localStorage.setItem("ll_token", token);
      localStorage.setItem("ll_user", JSON.stringify(safeUser));
      Store.session.set("loginTime", Date.now());
      return { token, user: safeUser };
    },

    register: async (name, email, password, role = "LAWYER") => {
      await Utils.delay(800);
      if (DB.users.byEmail(email)) return { error: "An account with this email already exists." };
      if (password.length < 8) return { error: "Password must be at least 8 characters." };
      const user = DB.users.create({ name, email, passwordHash: Utils.hashPassword(password), role });
      const { passwordHash: _, ...safeUser } = user;
      const token = "ll_tok_" + Utils.uid();
      localStorage.setItem("ll_token", token);
      localStorage.setItem("ll_user", JSON.stringify(safeUser));
      return { token, user: safeUser };
    },

    logout: () => {
      localStorage.removeItem("ll_token");
      localStorage.removeItem("ll_user");
      window.location.href = "login_page.html";
    },

    changePassword: async (currentPw, newPw) => {
      await Utils.delay(600);
      const user = Auth.currentUser();
      const dbUser = DB.users.byId(user.id);
      if (!dbUser) return { error: "User not found." };
      if (dbUser.passwordHash !== Utils.hashPassword(currentPw)) return { error: "Current password is incorrect." };
      if (newPw.length < 8) return { error: "New password must be at least 8 characters." };
      DB.users.update(user.id, { passwordHash: Utils.hashPassword(newPw) });
      return { success: true };
    },

    updateProfile: async (data) => {
      await Utils.delay(600);
      const user = Auth.currentUser();
      const updated = DB.users.update(user.id, data);
      const { passwordHash: _, ...safeUser } = updated;
      localStorage.setItem("ll_user", JSON.stringify(safeUser));
      return { success: true, user: safeUser };
    },

    guard: () => {
      const page = window.location.pathname.split("/").pop();
      const isLoginPage = page === "login_page.html" || page === "";
      if (!Auth.token() && !isLoginPage) { window.location.replace("login_page.html"); return false; }
      if (Auth.token() && isLoginPage) { window.location.replace("dashboard.html"); return false; }
      return true;
    }
  };

  /* ═══════════════════════════════════════════════════════════
     SECTION 6: TOAST
  ═══════════════════════════════════════════════════════════ */

  const Toast = {
    container: null,
    init: () => {
      if (document.getElementById("ll-toast-container")) return;
      const el = document.createElement("div");
      el.id = "ll-toast-container";
      el.style.cssText = "position:fixed;top:1.25rem;right:1.25rem;z-index:9999;display:flex;flex-direction:column;gap:0.5rem;pointer-events:none;";
      document.body.appendChild(el);
      Toast.container = el;
    },
    show: (msg, type = "info", duration = 4000) => {
      Toast.init();
      const icons = { success: "check_circle", error: "error", warning: "warning", info: "info" };
      const colors = { success: "bg-emerald-600 text-white", error: "bg-red-600 text-white", warning: "bg-amber-500 text-white", info: "bg-[#101c2e] text-white" };
      const id = Utils.uid();
      const el = document.createElement("div");
      el.id = "toast-" + id;
      el.style.cssText = "pointer-events:all;transition:all 0.3s ease;transform:translateX(120%);opacity:0;";
      el.className = `flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border border-white/10 backdrop-blur-sm text-sm font-medium ${colors[type]} max-w-xs`;
      el.innerHTML = `<span class="material-symbols-outlined text-[20px] flex-shrink-0" style="font-variation-settings:'FILL' 1">${icons[type]}</span><span class="flex-1">${Utils.esc(msg)}</span><button onclick="document.getElementById('toast-${id}')?.remove()" class="ml-2 opacity-70 hover:opacity-100 flex-shrink-0"><span class="material-symbols-outlined text-[18px]">close</span></button>`;
      Toast.container.appendChild(el);
      requestAnimationFrame(() => { el.style.transform = "translateX(0)"; el.style.opacity = "1"; });
      if (duration > 0) setTimeout(() => { el.style.transform = "translateX(120%)"; el.style.opacity = "0"; setTimeout(() => el.remove(), 300); }, duration);
    },
    success: (msg) => Toast.show(msg, "success"),
    error:   (msg) => Toast.show(msg, "error"),
    warning: (msg) => Toast.show(msg, "warning"),
    info:    (msg) => Toast.show(msg, "info"),
  };

  /* ═══════════════════════════════════════════════════════════
     SECTION 7: DARK MODE
  ═══════════════════════════════════════════════════════════ */

  const DarkMode = {
    init: () => { const dark = Store.get("darkMode") || false; document.documentElement.classList.toggle("dark", dark); },
    toggle: () => { const isDark = document.documentElement.classList.toggle("dark"); Store.set("darkMode", isDark); return isDark; },
    isDark: () => document.documentElement.classList.contains("dark"),
  };

  /* ═══════════════════════════════════════════════════════════
     SECTION 8: MODAL
  ═══════════════════════════════════════════════════════════ */

  const Modal = {
    show: (html, onConfirm) => {
      const backdrop = document.createElement("div");
      backdrop.id = "ll-modal-backdrop";
      backdrop.style.cssText = "position:fixed;inset:0;z-index:8000;background:rgba(16,28,46,0.6);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:1rem;";
      backdrop.innerHTML = `<div id="ll-modal-box" style="background:#fff;border-radius:1rem;width:100%;max-width:520px;box-shadow:0 24px 64px rgba(0,0,0,0.2);overflow:hidden;transform:scale(0.95);opacity:0;transition:all 0.2s ease;">${html}</div>`;
      document.body.appendChild(backdrop);
      requestAnimationFrame(() => { const box = document.getElementById("ll-modal-box"); if (box) { box.style.transform = "scale(1)"; box.style.opacity = "1"; } });
      backdrop.addEventListener("click", e => { if (e.target === backdrop) Modal.hide(); });
      document.getElementById("ll-modal-cancel")?.addEventListener("click", Modal.hide);
      if (onConfirm) document.getElementById("ll-modal-confirm")?.addEventListener("click", onConfirm);
    },
    hide: () => { const el = document.getElementById("ll-modal-backdrop"); if (el) { el.style.opacity = "0"; setTimeout(() => el.remove(), 200); } },
    confirm: (title, msg, onYes, btnLabel = "Confirm", danger = false) => {
      Modal.show(`<div class="p-6"><h3 class="font-headline font-bold text-lg text-slate-900 mb-2">${Utils.esc(title)}</h3><p class="text-sm text-slate-600 mb-6">${Utils.esc(msg)}</p><div class="flex gap-3 justify-end"><button id="ll-modal-cancel" class="px-4 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">Cancel</button><button id="ll-modal-confirm" class="px-4 py-2 rounded-lg text-sm font-bold text-white transition-colors ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-[#101c2e] hover:bg-[#1e3a5f]'}">${Utils.esc(btnLabel)}</button></div></div>`, onYes);
    }
  };

  /* ═══════════════════════════════════════════════════════════
     SECTION 9: LOADING
  ═══════════════════════════════════════════════════════════ */

  const Loading = {
    btn: (btn, label = "Processing...") => {
      btn._origHTML = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `<svg class="animate-spin h-4 w-4 mr-2 inline" viewBox="0 0 24 24" fill="none"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path></svg>${label}`;
    },
    btnReset: (btn) => { btn.disabled = false; btn.innerHTML = btn._origHTML || btn.innerHTML; },
    skeleton: (container, rows = 3) => {
      container.innerHTML = Array(rows).fill(`<div class="flex gap-4 p-4 animate-pulse"><div class="w-10 h-10 bg-slate-200 rounded-lg flex-shrink-0"></div><div class="flex-1 space-y-2"><div class="h-3 bg-slate-200 rounded w-3/4"></div><div class="h-3 bg-slate-200 rounded w-1/2"></div></div></div>`).join("");
    }
  };

  /* ═══════════════════════════════════════════════════════════
     SECTION 10: GLOBAL SEARCH
  ═══════════════════════════════════════════════════════════ */

  const Search = {
    globalSearch: (query) => {
      const q = query.toLowerCase().trim();
      if (!q) return [];
      const results = [];
      DB.cases.all().forEach(c => {
        if (c.title.toLowerCase().includes(q) || c.clientName.toLowerCase().includes(q) || c.caseNumber.toLowerCase().includes(q)) {
          results.push({ type: "case", icon: "folder_open", title: c.title, subtitle: c.clientName + " · " + c.caseNumber, href: `case_detail.html?id=${c.id}` });
        }
      });
      DB.documents.all().forEach(d => {
        if (d.name.toLowerCase().includes(q)) {
          results.push({ type: "document", icon: "description", title: d.name, subtitle: "Document", href: `documents.html?highlight=${d.id}` });
        }
      });
      DB.users.all().forEach(u => {
        if (u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) {
          results.push({ type: "user", icon: "person", title: u.name, subtitle: u.email, href: "user_management.html" });
        }
      });
      return results.slice(0, 8);
    },
    initGlobalSearch: () => {
      const inputs = document.querySelectorAll("header input[type='text']");
      inputs.forEach(input => {
        let panel = null;
        input.addEventListener("input", () => {
          const q = input.value.trim();
          if (panel) panel.remove();
          if (!q) return;
          const results = Search.globalSearch(q);
          panel = document.createElement("div");
          panel.className = "absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-2xl border border-slate-100 overflow-hidden z-[999]";
          if (results.length === 0) {
            panel.innerHTML = `<div class="p-4 text-sm text-slate-500 text-center">No results for "${Utils.esc(q)}"</div>`;
          } else {
            panel.innerHTML = results.map(r => `<a href="${r.href}" class="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors"><div class="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0"><span class="material-symbols-outlined text-[16px] text-slate-500">${r.icon}</span></div><div><p class="text-sm font-semibold text-slate-900">${Utils.esc(r.title)}</p><p class="text-xs text-slate-500">${Utils.esc(r.subtitle)}</p></div></a>`).join("");
          }
          const wrapper = input.closest(".relative") || input.parentElement;
          wrapper.style.position = "relative";
          wrapper.appendChild(panel);
        });
        document.addEventListener("click", e => { if (!input.contains(e.target) && panel) { panel.remove(); panel = null; } });
      });
    }
  };

  /* ═══════════════════════════════════════════════════════════
     SECTION 11: AI ASSISTANT
  ═══════════════════════════════════════════════════════════ */

  const AI = {
    // Keyword/template-based mock responses for offline use
    _mockResponse: (content, caseData, docs) => {
      const q = content.toLowerCase();
      const caseName = caseData ? caseData.title : "this case";
      const caseType = caseData ? caseData.type : "Legal";
      const client   = caseData ? caseData.clientName : "the client";
      const docList  = docs.length ? docs.map(d => `• ${d.name}`).join("\n") : "No documents uploaded yet.";

      if (/summarize|summary|overview|brief me|tell me about/.test(q)) {
        return `**Case Summary — ${caseName}**\n\n**Client:** ${client}\n**Type:** ${caseType}\n**Status:** ${caseData?.status || "Active"}\n\n${caseData?.description || "No description provided."}\n\n**Available Evidence:**\n${docList}\n\n**Key Observations:**\n- Case appears to be in ${caseData?.status === "OPEN" ? "active litigation" : "resolution phase"}\n- ${docs.length} document(s) on file requiring review\n- Next hearing: ${caseData?.nextHearing ? new Date(caseData.nextHearing).toLocaleDateString() : "Not scheduled"}\n\nRecommend a comprehensive document review prior to next court date.`;
      }
      if (/risk|exposure|weakness|vulnerab/.test(q)) {
        return `**Legal Risk Assessment — ${caseName}**\n\n**Identified Risk Factors:**\n\n1. **Evidentiary Gaps** — ${docs.length === 0 ? "No documents have been uploaded. This is a critical gap." : `${docs.length} document(s) on file — ensure chain of custody is documented.`}\n\n2. **Procedural Risks** — Missing filing deadlines or improper service can result in dismissal or default judgment.\n\n3. **Opposing Counsel Strategy** — Anticipate discovery requests targeting ${caseType.toLowerCase()} communications and internal records.\n\n4. **Witness Credibility** — Prepare witnesses with mock cross-examination sessions at least 2 weeks before trial.\n\n**Mitigation Recommendations:**\n- File all protective orders promptly\n- Establish a privilege log for attorney-client communications\n- Engage expert witnesses for technical ${caseType.toLowerCase()} testimony\n- Document all client communications in writing`;
      }
      if (/strategy|outline|plan|approach|recommend/.test(q)) {
        return `**Strategic Litigation Plan — ${caseName}**\n\n**Phase 1: Pre-Trial Preparation**\n- Complete document review and privilege log\n- Serve initial disclosures within statutory deadlines\n- File any necessary motions in limine\n- Conduct depositions of key witnesses\n\n**Phase 2: Discovery Management**\n- Issue targeted interrogatories focusing on core disputed facts\n- Request production of all ${caseType.toLowerCase()}-related communications\n- Retain subject matter expert for technical opinions\n\n**Phase 3: Motion Practice**\n- Evaluate viability of summary judgment motion\n- Prepare opposition to anticipated opposing motions\n- File Daubert challenges if expert testimony is vulnerable\n\n**Phase 4: Trial Readiness**\n- Prepare trial exhibits and demonstratives\n- Conduct jury consultant review (if applicable)\n- Draft opening statement and closing argument outlines\n\n**Recommended Timeline:** Begin Phase 1 immediately given current case posture.`;
      }
      if (/document|evidence|exhibit|file|pdf/.test(q)) {
        return `**Document Analysis — ${caseName}**\n\n**Current Document Inventory:**\n${docList}\n\n**Review Priorities:**\n1. Authenticate all exhibits — confirm date, author, and chain of custody\n2. Flag any documents containing **admissions** or **contradictions**\n3. Organize by chronology for timeline construction\n4. Identify privileged materials for redaction before production\n\n**Discovery Considerations:**\n- Ensure all responsive documents are produced to avoid spoliation claims\n- Metadata should be preserved in original native format\n- Consider requesting in camera review for disputed privilege claims\n\n_Tip: Upload additional documents to this case for deeper analysis._`;
      }
      if (/deadline|date|hearing|schedule|calendar/.test(q)) {
        return `**Deadline & Schedule Review — ${caseName}**\n\n**Upcoming Key Dates:**\n- Next Hearing: ${caseData?.nextHearing ? new Date(caseData.nextHearing).toLocaleDateString("en-US", { weekday:"long", year:"numeric", month:"long", day:"numeric" }) : "Not yet scheduled"}\n\n**Recommended Preparatory Timeline:**\n- **T-30 days:** Complete all discovery responses\n- **T-21 days:** File all pre-trial motions\n- **T-14 days:** Exchange exhibit lists with opposing counsel\n- **T-7 days:** Conduct full trial rehearsal with client\n- **T-2 days:** Confirm witness availability and court logistics\n\n**Critical Reminders:**\n- Statute of limitations must be monitored for any counterclaims\n- Court-ordered deadlines are non-negotiable — request extensions proactively\n- Ensure client is available for all scheduled appearances`;
      }
      if (/settlement|negotiate|offer|resolve|mediat/.test(q)) {
        return `**Settlement Analysis — ${caseName}**\n\n**Settlement Viability Assessment:**\nBased on the current case posture (${caseData?.status || "Active"}), settlement exploration is **advisable** at this stage.\n\n**Factors Favoring Settlement:**\n- Reduced litigation costs and time\n- Certainty of outcome vs. trial risk\n- Preservation of business relationships (if applicable)\n- Avoidance of adverse public record\n\n**Factors Against Early Settlement:**\n- Insufficient discovery may undervalue the claim\n- Opposing party may interpret early settlement interest as weakness\n- Full damages not yet quantified\n\n**Recommended Approach:**\n1. Establish internal settlement authority range with client\n2. Propose mediation through a neutral third party\n3. Prepare comprehensive damages analysis before any demand\n4. Set clear walk-away thresholds in writing before negotiations begin\n\n_Note: All settlement communications should be marked "Confidential — For Settlement Purposes Only" per FRE 408._`;
      }
      // Default response
      return `**Libra AI — Legal Analysis**\n\nRegarding your query about **${caseName}**:\n\nI've reviewed the case context and available materials. Here are my observations:\n\n**Case Context:**\n- Type: ${caseType}\n- Client: ${client}\n- Current Status: ${caseData?.status || "Active"}\n- Documents on File: ${docs.length}\n\n**General Guidance:**\nFor this type of ${caseType.toLowerCase()} matter, I recommend focusing on three key areas: (1) thorough documentary evidence organization, (2) clear legal theory development, and (3) proactive communication with the client regarding expectations and timeline.\n\nFor more specific analysis, try asking me to:\n- _Summarize this case_\n- _Identify key legal risks_\n- _Draft a strategy outline_\n- _Analyze documents_\n- _Review upcoming deadlines_\n- _Assess settlement options_`;
    },

    sendMessage: async (threadId, content, caseId) => {
      const caseData = caseId ? DB.cases.byId(caseId) : null;
      const docs = caseId ? DB.documents.byCaseId(caseId) : [];

      // Retrieve the user-configured Anthropic API key
      const apiKey = Store.get("anthropicApiKey");
      if (!apiKey) {
        // Use mock keyword-based response with a realistic delay
        await Utils.delay(900);
        const reply = AI._mockResponse(content, caseData, docs);
        return DB.messages.create({ threadId, role: "assistant", content: reply });
      }

      const history = DB.messages.byThread(threadId);
      const systemPrompt = `You are Libra AI, a highly intelligent legal assistant for LawLibra — The Sovereign Counsel.${caseData ? `\n\nYou are assisting with case: "${caseData.title}" (${caseData.caseNumber}). Client: ${caseData.clientName}. Type: ${caseData.type}. Status: ${caseData.status}.\nCase description: ${caseData.description}\nAvailable documents: ${docs.map(d => d.name).join(", ") || "None"}` : ""}\nYou provide expert legal analysis, strategy recommendations, and research synthesis. Be precise, professional, and structured. Use bold for key terms. Provide actionable insights. Keep responses concise but thorough.`;

      try {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-request-allow-browser": "true"
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1000,
            system: systemPrompt,
            messages: history.map(m => ({ role: m.role, content: m.content }))
          })
        });
        const data = await response.json();
        if (data.error) {
          const errMsg = data.error.message || "Unknown API error.";
          const reply = `⚠️ **API Error:** ${errMsg}\n\nFalling back to offline analysis...\n\n` + AI._mockResponse(content, caseData, docs);
          return DB.messages.create({ threadId, role: "assistant", content: reply });
        }
        const reply = data.content?.map(b => b.text || "").join("") || "I apologize, I was unable to process your request at this time.";
        return DB.messages.create({ threadId, role: "assistant", content: reply });
      } catch (err) {
        await Utils.delay(700);
        const reply = AI._mockResponse(content, caseData, docs);
        return DB.messages.create({ threadId, role: "assistant", content: reply });
      }
    },

    getApiKey: () => Store.get("anthropicApiKey") || "",
    setApiKey: (key) => Store.set("anthropicApiKey", key.trim()),
    clearApiKey: () => Store.del("anthropicApiKey"),
  };

  /* ═══════════════════════════════════════════════════════════
     SECTION 12: DASHBOARD STATS
  ═══════════════════════════════════════════════════════════ */

  const Dashboard = {
    getStats: () => {
      const cases = DB.cases.all();
      const docs  = DB.documents.all();
      const today = new Date().toISOString().split("T")[0];
      return {
        totalCases:    cases.length,
        openCases:     cases.filter(c => c.status === "OPEN").length,
        closedCases:   cases.filter(c => c.status === "CLOSED").length,
        totalDocs:     docs.length,
        todayHearings: DB.events.forDate(today).filter(e => e.type === "HEARING").length,
        upcomingEvents: DB.events.all().filter(e => e.date >= today).length,
        unreadNotifs:  DB.notifications.all("*").filter(n => !n.read).length,
      };
    },
    getRecentActivity: () => {
      const docs  = DB.documents.all().slice(-3).reverse();
      const cases = DB.cases.all().slice(-3).reverse();
      return [...docs.map(d => ({ icon: "description", text: `Document uploaded: ${d.name}`, time: Utils.relTime(d.uploadedAt), color: "text-blue-600 bg-blue-50" })),
              ...cases.map(c => ({ icon: "folder_open", text: `Case updated: ${c.title}`, time: Utils.relTime(c.filedAt), color: "text-emerald-600 bg-emerald-50" }))].slice(0, 5);
    }
  };

  /* ═══════════════════════════════════════════════════════════
     SECTION 13: PUBLIC API
  ═══════════════════════════════════════════════════════════ */

  seedDatabase();
  DarkMode.init();

  window.LawLibra = {
    Auth, DB, Utils, Toast, Modal, Loading, Search, DarkMode, AI, Dashboard, Store,
    Cases:   DB.cases,
    Docs:    DB.documents,
    Folders: DB.folders,
    Events:  DB.events,
    Users:   DB.users,
    Notifs:  DB.notifications,
  };

  document.addEventListener("DOMContentLoaded", () => {
    Toast.init();
    Search.initGlobalSearch();
  });

})(window);