/**
 * LawLibra — nav.js v2
 * Handles: sidebar, notification dropdown, profile dropdown, logout, auth guard
 */
(function () {

  /* ─── Config ─────────────────────────────────────────────── */
  const NAV = [
    { key:"dashboard",  label:"Dashboard",  icon:"dashboard",      href:"dashboard.html" },
    { key:"cases",      label:"Cases",       icon:"folder_open",    href:"case_list.html" },
    { key:"documents",  label:"Documents",   icon:"description",    href:"documents.html" },
    { key:"ai",         label:"AI Chat",     icon:"auto_awesome",   href:"ai_assistant.html" },
    { key:"calendar",   label:"Calendar",    icon:"calendar_month", href:"calendar.html" },
  ];
  const BOTTOM = [
    { key:"admin",   label:"Admin",   icon:"gavel",          href:"user_management.html", adminOnly:true },
    { key:"profile", label:"Profile", icon:"manage_accounts", href:"settings.html" },
  ];

  const PAGE_MAP = {
    "dashboard.html":"dashboard","case_list.html":"cases","case_detail.html":"cases",
    "documents.html":"documents","ai_assistant.html":"ai","calendar.html":"calendar",
    "notification.html":"notifications","user_management.html":"admin","settings.html":"profile",
  };

  /* ─── Helpers ─────────────────────────────────────────────── */
  const page    = window.location.pathname.split("/").pop() || "dashboard.html";
  const active  = PAGE_MAP[page] || "";
  const getUser = () => { try { return JSON.parse(localStorage.getItem("ll_user")||"{}"); } catch{return{};} };
  const user    = getUser();
  const isAdmin = user.role === "ADMIN";
  const token   = localStorage.getItem("ll_token");

  /* ─── Auth Guard ──────────────────────────────────────────── */
  const isLogin = page === "login_page.html" || page === "";
  if (!token && !isLogin) { window.location.href = "login_page.html"; return; }
  if (token && isLogin)   { window.location.href = "dashboard.html"; return; }

  /* ─── Build nav item ──────────────────────────────────────── */
  function navItem(item) {
    const on = item.key === active;
    return `<a href="${item.href}" class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150
      ${on ? "bg-white/10 text-white font-semibold" : "text-slate-400 hover:text-white hover:bg-white/5"}">
      <span class="material-symbols-outlined text-[20px]" style="${on?"font-variation-settings:'FILL' 1":""}">${item.icon}</span>
      <span>${item.label}</span>
    </a>`;
  }

  /* ─── Inject Sidebar ──────────────────────────────────────── */
  document.querySelectorAll("aside#ll-sidebar").forEach(aside => {
    const logo = aside.querySelector("div.mb-10, div[class*='mb-']") || "";
    const logoHTML = logo ? logo.outerHTML : `<div class="mb-8 px-2 flex items-center gap-3">
      <div class="w-9 h-9 bg-amber-400/20 rounded-lg flex items-center justify-center">
        <span class="material-symbols-outlined text-amber-400 text-[20px]" style="font-variation-settings:'FILL' 1">balance</span>
      </div>
      <div><h1 class="text-lg font-bold text-white font-headline leading-tight">LawLibra</h1>
      <p class="text-[9px] uppercase tracking-widest text-slate-500">Sovereign Counsel</p></div>
    </div>`;

    const bottomItems = BOTTOM.filter(b => !b.adminOnly || isAdmin);

    aside.innerHTML = `
      ${logoHTML}
      <nav class="flex-1 space-y-0.5 overflow-y-auto">
        ${NAV.map(navItem).join("")}
      </nav>
      <div class="pt-3 mt-3 border-t border-white/10 space-y-0.5">
        ${bottomItems.map(navItem).join("")}
        <button id="ll-logout-btn" class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all duration-150 text-left">
          <span class="material-symbols-outlined text-[20px]">logout</span>
          <span>Logout</span>
        </button>
      </div>`;

    // Restore logo styles (it gets wiped by innerHTML)
    const logoEl = aside.querySelector("div.mb-10, div[class*='mb-']");
  });

  /* ─── Logout ──────────────────────────────────────────────── */
  document.querySelectorAll("#ll-logout-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      localStorage.removeItem("ll_token");
      localStorage.removeItem("ll_user");
      window.location.href = "login_page.html";
    });
  });

  /* ─── Fix TopNav: user name + notification bell ───────────── */
  // Replace hardcoded name/role in header
  document.querySelectorAll("header").forEach(header => {
    // Inject notification + profile into right side of header
    const rightZone = header.querySelector(".flex.items-center.gap-6:last-child, .flex.items-center.gap-3:last-child");
  });

  // Replace all hardcoded name text
  const allText = document.body.innerHTML;
  const names   = ["Julian Sterling, Esq.","Julian Thorne, Esq.","Julian Sterling","Julian Thorne","Senior Partner"];
  let fixed = allText;
  names.forEach(n => { fixed = fixed.split(n).join(user.name || "User"); });
  document.body.innerHTML = fixed;
  // Re-attach logout (lost after innerHTML replace)
  document.querySelectorAll("#ll-logout-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      localStorage.removeItem("ll_token");
      localStorage.removeItem("ll_user");
      window.location.href = "login_page.html";
    });
  });

  /* ─── Notification Dropdown Panel ────────────────────────── */
  const DEMO_NOTIFS = [
    { id:1, title:"Hearing Tomorrow", msg:"Sterling vs Global Corp – 10:30 AM", type:"hearing", time:"1h ago", read:false },
    { id:2, title:"Document Processed", msg:"Affidavit_2024.pdf is ready", type:"document", time:"3h ago", read:false },
    { id:3, title:"Case Updated", msg:"TechNova IP status changed to OPEN", type:"case", time:"Yesterday", read:true },
    { id:4, title:"New Assignment", msg:"You have been assigned to Miller vs State", type:"case", time:"2 days ago", read:true },
  ];

  const typeIcon = { hearing:"gavel", document:"description", case:"folder_open" };

  function buildNotifPanel() {
    const unread = DEMO_NOTIFS.filter(n=>!n.read).length;
    return `
    <div id="ll-notif-panel" class="hidden absolute right-0 top-12 w-80 bg-white rounded-xl shadow-2xl border border-slate-100 z-[200] overflow-hidden">
      <div class="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <span class="font-semibold text-slate-800 text-sm">Notifications</span>
        <button id="ll-mark-all" class="text-xs text-blue-600 hover:underline font-medium">Mark all read</button>
      </div>
      <div class="max-h-80 overflow-y-auto divide-y divide-slate-50">
        ${DEMO_NOTIFS.map(n => `
          <div class="flex gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer ${n.read?"opacity-60":""}" data-nid="${n.id}">
            <div class="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center
              ${n.type==="hearing"?"bg-amber-100 text-amber-600":n.type==="document"?"bg-blue-100 text-blue-600":"bg-slate-100 text-slate-600"}">
              <span class="material-symbols-outlined text-[16px]">${typeIcon[n.type]||"notifications"}</span>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-xs font-semibold text-slate-800 ${n.read?"":""}">
                ${n.read?"":"<span class='inline-block w-1.5 h-1.5 bg-blue-500 rounded-full mr-1 mb-0.5'></span>"}${n.title}
              </p>
              <p class="text-xs text-slate-500 truncate">${n.msg}</p>
              <p class="text-[10px] text-slate-400 mt-0.5">${n.time}</p>
            </div>
          </div>`).join("")}
      </div>
      <div class="px-4 py-2.5 border-t border-slate-100 text-center">
        <span class="text-xs text-slate-500">Notifications will load from backend when connected</span>
      </div>
    </div>`;
  }

  // Find bell button and wrap it
  document.querySelectorAll("header button").forEach(btn => {
    const icon = btn.querySelector(".material-symbols-outlined");
    if (icon && icon.textContent.trim() === "notifications") {
      btn.style.position = "relative";
      btn.insertAdjacentHTML("afterend", ""); // temp
      const wrapper = document.createElement("div");
      wrapper.className = "relative";
      btn.parentNode.insertBefore(wrapper, btn);
      wrapper.appendChild(btn);

      // Update badge dot
      btn.innerHTML = `
        <span class="material-symbols-outlined text-[22px] text-slate-500">notifications</span>
        <span class="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>`;

      wrapper.insertAdjacentHTML("beforeend", buildNotifPanel());

      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const panel = wrapper.querySelector("#ll-notif-panel");
        panel.classList.toggle("hidden");
        // close profile if open
        const pp = document.getElementById("ll-profile-panel");
        if (pp) pp.classList.add("hidden");
      });

      // Mark all read
      wrapper.querySelector("#ll-mark-all")?.addEventListener("click", () => {
        DEMO_NOTIFS.forEach(n => n.read = true);
        const panel = wrapper.querySelector("#ll-notif-panel");
        panel.remove();
        wrapper.insertAdjacentHTML("beforeend", buildNotifPanel());
        btn.querySelector("span.absolute")?.remove();
        wrapper.querySelector("#ll-mark-all")?.addEventListener("click", ()=>{});
      });
    }
  });

  /* ─── Profile Dropdown (avatar click) ────────────────────── */
  const profileDropHTML = `
    <div id="ll-profile-panel" class="hidden absolute right-0 top-12 w-64 bg-white rounded-xl shadow-2xl border border-slate-100 z-[200] overflow-hidden">
      <div class="px-4 py-4 bg-gradient-to-br from-[#101c2e] to-[#3c475b]">
        <div class="w-10 h-10 rounded-full bg-amber-400/20 border-2 border-amber-400/40 flex items-center justify-center mb-2">
          <span class="material-symbols-outlined text-amber-400" style="font-variation-settings:'FILL' 1">person</span>
        </div>
        <p class="text-white font-semibold text-sm">${user.name || "User"}</p>
        <p class="text-slate-400 text-xs">${user.email || "—"}</p>
        <span class="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase
          ${isAdmin ? "bg-amber-400/20 text-amber-400" : "bg-blue-400/20 text-blue-300"}">
          ${user.role || "LAWYER"}
        </span>
      </div>
      <div class="py-1">
        <a href="settings.html" class="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
          <span class="material-symbols-outlined text-[18px] text-slate-400">manage_accounts</span> Profile & Settings
        </a>
        <a href="settings.html#security" class="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
          <span class="material-symbols-outlined text-[18px] text-slate-400">lock</span> Change Password
        </a>
        <div class="border-t border-slate-100 mt-1 pt-1">
          <button id="ll-profile-logout" class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 text-left">
            <span class="material-symbols-outlined text-[18px]">logout</span> Sign Out
          </button>
        </div>
      </div>
    </div>`;

  document.querySelectorAll("header .flex.items-center.gap-3, header .flex.items-center.gap-6").forEach(zone => {
    const imgs = zone.querySelectorAll("img");
    imgs.forEach(img => {
      const wrapper = document.createElement("div");
      wrapper.className = "relative cursor-pointer";
      img.parentNode.insertBefore(wrapper, img);
      // Take the whole avatar block (img + name text)
      const nameDiv = img.previousElementSibling;
      if (nameDiv) wrapper.appendChild(nameDiv);
      wrapper.appendChild(img);
      wrapper.insertAdjacentHTML("beforeend", profileDropHTML);

      // Replace hardcoded avatar with initials
      const initials = (user.name||"U").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
      img.outerHTML = `<div class="w-9 h-9 rounded-full bg-[#101c2e] border-2 border-amber-400/40 flex items-center justify-center text-amber-400 font-bold text-sm flex-shrink-0">${initials}</div>`;

      wrapper.addEventListener("click", (e) => {
        e.stopPropagation();
        const panel = wrapper.querySelector("#ll-profile-panel");
        panel.classList.toggle("hidden");
        const np = document.querySelector("#ll-notif-panel");
        if (np) np.classList.add("hidden");
      });

      wrapper.querySelector("#ll-profile-logout")?.addEventListener("click", () => {
        localStorage.removeItem("ll_token");
        localStorage.removeItem("ll_user");
        window.location.href = "login_page.html";
      });
    });
  });

  /* ─── Close dropdowns on outside click ───────────────────── */
  document.addEventListener("click", () => {
    document.querySelectorAll("#ll-notif-panel, #ll-profile-panel").forEach(p => p.classList.add("hidden"));
  });

})();
