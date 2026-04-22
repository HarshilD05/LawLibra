/**
 * LawLibra — nav.js v3
 * Handles: sidebar injection, notification dropdown, profile dropdown, auth guard
 */
(function () {

  const NAV = [
    { key:"dashboard",     label:"Dashboard",     icon:"dashboard",      href:"dashboard.html" },
    { key:"cases",         label:"Cases",          icon:"folder_open",    href:"case_list.html" },
    { key:"calendar",      label:"Calendar",       icon:"calendar_month", href:"calendar.html" },
    { key:"notifications", label:"Notifications",  icon:"notifications",  href:"notification.html" },
  ];
  const BOTTOM = [
    { key:"admin",   label:"Admin Panel", icon:"gavel",          href:"user_management.html", adminOnly:true },
    { key:"profile", label:"Settings",    icon:"manage_accounts", href:"settings.html" },
  ];

  const PAGE_MAP = {
    "dashboard.html":"dashboard","case_list.html":"cases","case_detail.html":"cases",
    "calendar.html":"calendar",
    "notification.html":"notifications","user_management.html":"admin","settings.html":"profile",
  };

  const page    = window.location.pathname.split("/").pop() || "dashboard.html";
  const active  = PAGE_MAP[page] || "";
  const getUser = () => { try { return JSON.parse(localStorage.getItem("ll_user")||"{}"); } catch{return{};} };
  const user    = getUser();
  const isAdmin = user.role === "ADMIN";
  const token   = localStorage.getItem("ll_token");

  const isLogin = page === "login_page.html" || page === "";
  if (!token && !isLogin) { window.location.href = "login_page.html"; return; }
  if (token && isLogin)   { window.location.href = "dashboard.html"; return; }

  function getNotifCount() {
    try {
      const ns = JSON.parse(localStorage.getItem("ll_notifications") || "[]");
      return ns.filter(n => !n.read && (n.userId === "*" || n.userId === user.id)).length;
    } catch { return 0; }
  }

  document.querySelectorAll("aside#ll-sidebar").forEach(aside => {
    const bottomItems = BOTTOM.filter(b => !b.adminOnly || isAdmin);
    const unread = getNotifCount();
    const initials = (user.name||"U").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();

    aside.innerHTML = `
      <div class="mb-8 px-2 flex items-center gap-3">
        <div class="w-9 h-9 bg-amber-400/20 rounded-lg flex items-center justify-center flex-shrink-0">
          <span class="material-symbols-outlined text-amber-400 text-[20px]" style="font-variation-settings:'FILL' 1">balance</span>
        </div>
        <div><h1 class="text-base font-bold text-white font-headline leading-tight">LawLibra</h1><p class="text-[9px] uppercase tracking-widest text-slate-500">Sovereign Counsel</p></div>
      </div>
      <nav class="flex-1 space-y-0.5 overflow-y-auto">
        ${NAV.map(item => {
          const on = item.key === active;
          const badge = item.key === "notifications" && unread > 0 ? `<span class="ml-auto bg-red-500 text-white text-[9px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center">${unread}</span>` : "";
          return `<a href="${item.href}" class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 ${on?"bg-white/10 text-white font-semibold":"text-slate-400 hover:text-white hover:bg-white/5"}"><span class="material-symbols-outlined text-[20px]" style="${on?"font-variation-settings:'FILL' 1":""}">${item.icon}</span><span class="flex-1">${item.label}</span>${badge}</a>`;
        }).join("")}
      </nav>
      <div class="pt-3 mt-3 border-t border-white/10 space-y-0.5">
        ${bottomItems.map(item => {
          const on = item.key === active;
          return `<a href="${item.href}" class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 ${on?"bg-white/10 text-white font-semibold":"text-slate-400 hover:text-white hover:bg-white/5"}"><span class="material-symbols-outlined text-[20px]" style="${on?"font-variation-settings:'FILL' 1":""}">${item.icon}</span><span>${item.label}</span></a>`;
        }).join("")}
        <button id="ll-logout-btn" class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all text-left">
          <span class="material-symbols-outlined text-[20px]">logout</span><span>Logout</span>
        </button>
      </div>
      <div class="mt-4 px-2 py-3 rounded-lg bg-white/5 border border-white/10">
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-full bg-amber-400/20 border border-amber-400/30 flex items-center justify-center flex-shrink-0">
            <span class="text-amber-400 font-bold text-xs">${initials}</span>
          </div>
          <div class="min-w-0"><p class="text-white text-xs font-semibold truncate">${user.name||"User"}</p><p class="text-slate-500 text-[10px] truncate">${user.role||"LAWYER"}</p></div>
        </div>
      </div>`;
  });

  function doLogout() {
    localStorage.removeItem("ll_token");
    localStorage.removeItem("ll_user");
    window.location.href = "login_page.html";
  }

  document.querySelectorAll("#ll-logout-btn").forEach(btn => btn.addEventListener("click", doLogout));

  // Replace hardcoded names
  const names = ["Julian Sterling, Esq.","Julian Thorne, Esq.","Julian Sterling","Julian Thorne","Marcus Thorne, Esq.","Marcus Chen","Senior Partner"];
  let bodyHtml = document.body.innerHTML;
  names.forEach(n => { bodyHtml = bodyHtml.split(n).join(user.name || "Counselor"); });
  document.body.innerHTML = bodyHtml;
  document.querySelectorAll("#ll-logout-btn").forEach(btn => btn.addEventListener("click", doLogout));

  /* ─── Notification Dropdown ── */
  function getNotifs() { try { return JSON.parse(localStorage.getItem("ll_notifications")||"[]"); } catch { return []; } }
  const typeIcon = { hearing:"gavel", document:"description", case:"folder_open", ai:"auto_awesome" };
  const typeColor = { hearing:"bg-amber-100 text-amber-600", document:"bg-blue-100 text-blue-600", case:"bg-slate-100 text-slate-600", ai:"bg-purple-100 text-purple-600" };

  function buildNotifPanel(notifs) {
    const unread = notifs.filter(n=>!n.read).length;
    return `<div id="ll-notif-panel" class="hidden absolute right-0 top-12 w-80 bg-white rounded-xl shadow-2xl border border-slate-100 z-[9000] overflow-hidden">
      <div class="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <span class="font-semibold text-slate-800 text-sm">Notifications${unread>0?` <span class="text-xs bg-red-100 text-red-600 font-bold px-1.5 py-0.5 rounded-full ml-1">${unread}</span>`:""}</span>
        <button id="ll-mark-all" class="text-xs text-blue-600 hover:underline font-medium">Mark all read</button>
      </div>
      <div class="max-h-72 overflow-y-auto divide-y divide-slate-50">
        ${notifs.length===0?`<div class="p-6 text-center text-slate-500 text-sm">No notifications</div>`:notifs.slice(0,6).map(n=>`
          <div class="flex gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer ${n.read?"opacity-60":""}" onclick="window.location='notification.html'">
            <div class="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center ${typeColor[n.type]||"bg-slate-100 text-slate-600"}">
              <span class="material-symbols-outlined text-[16px]" style="font-variation-settings:'FILL' 1">${typeIcon[n.type]||"notifications"}</span>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-xs ${n.read?"font-medium":"font-bold"} text-slate-800">${n.title}</p>
              <p class="text-xs text-slate-500 truncate">${n.message}</p>
            </div>
            ${!n.read?'<div class="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-1.5"></div>':''}
          </div>`).join("")}
      </div>
      <div class="px-4 py-2.5 border-t border-slate-100 text-center">
        <a href="notification.html" class="text-xs text-blue-600 hover:underline font-medium">View all notifications</a>
      </div>
    </div>`;
  }

  document.querySelectorAll("header button").forEach(btn => {
    const icon = btn.querySelector(".material-symbols-outlined");
    if (icon && (icon.textContent.trim() === "notifications" || icon.getAttribute("data-icon") === "notifications")) {
      const wrapper = document.createElement("div");
      wrapper.className = "relative";
      btn.parentNode.insertBefore(wrapper, btn);
      wrapper.appendChild(btn);
      const notifs = getNotifs();
      const uc = notifs.filter(n=>!n.read).length;
      btn.innerHTML = `<span class="material-symbols-outlined text-[22px] text-slate-500">notifications</span>${uc>0?`<span class="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>`:""}`;
      btn.style.position = "relative";
      wrapper.insertAdjacentHTML("beforeend", buildNotifPanel(notifs));
      btn.addEventListener("click", e => {
        e.stopPropagation();
        wrapper.querySelector("#ll-notif-panel")?.classList.toggle("hidden");
        document.getElementById("ll-profile-panel")?.classList.add("hidden");
      });
      wrapper.addEventListener("click", e => e.stopPropagation());
      wrapper.querySelector("#ll-mark-all")?.addEventListener("click", e => {
        e.stopPropagation();
        const ns = getNotifs().map(n=>({...n,read:true}));
        localStorage.setItem("ll_notifications", JSON.stringify(ns));
        wrapper.querySelector("#ll-notif-panel")?.remove();
        wrapper.insertAdjacentHTML("beforeend", buildNotifPanel(ns));
        btn.innerHTML = `<span class="material-symbols-outlined text-[22px] text-slate-500">notifications</span>`;
      });
    }
  });

  /* ─── Profile Dropdown ── */
  const initials = (user.name||"U").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
  const profileDropHTML = `<div id="ll-profile-panel" class="hidden absolute right-0 top-12 w-64 bg-white rounded-xl shadow-2xl border border-slate-100 z-[9000] overflow-hidden">
    <div class="px-4 py-4 bg-gradient-to-br from-[#101c2e] to-[#3c475b]">
      <div class="w-10 h-10 rounded-full bg-amber-400/20 border-2 border-amber-400/40 flex items-center justify-center mb-2"><span class="text-amber-400 font-bold text-sm">${initials}</span></div>
      <p class="text-white font-semibold text-sm">${user.name||"User"}</p>
      <p class="text-slate-400 text-xs">${user.email||"—"}</p>
      <span class="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase ${isAdmin?"bg-amber-400/20 text-amber-400":"bg-blue-400/20 text-blue-300"}">${user.role||"LAWYER"}</span>
    </div>
    <div class="py-1">
      <a href="settings.html" class="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"><span class="material-symbols-outlined text-[18px] text-slate-400">manage_accounts</span>Profile & Settings</a>
      <a href="settings.html#security" class="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"><span class="material-symbols-outlined text-[18px] text-slate-400">lock</span>Change Password</a>
      ${isAdmin?`<a href="user_management.html" class="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"><span class="material-symbols-outlined text-[18px] text-slate-400">gavel</span>Admin Panel</a>`:""}
      <div class="border-t border-slate-100 mt-1 pt-1">
        <button id="ll-profile-logout" class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 text-left"><span class="material-symbols-outlined text-[18px]">logout</span>Sign Out</button>
      </div>
    </div>
  </div>`;

  // Attach to hdr-avatar or img tags in header
  document.querySelectorAll("header").forEach(header => {
    const targets = [...header.querySelectorAll("[id*='avatar']"), ...header.querySelectorAll("img")];
    targets.forEach(el => {
      if (el.closest("[id*='ll-profile']")) return;
      const wrapper = document.createElement("div");
      wrapper.className = "relative cursor-pointer";
      el.parentNode.insertBefore(wrapper, el);
      if (el.tagName === "IMG") {
        const av = document.createElement("div");
        av.className = "w-10 h-10 rounded-full bg-[#101c2e] border-2 border-amber-400/40 flex items-center justify-center text-amber-400 font-bold text-sm flex-shrink-0";
        av.textContent = initials;
        wrapper.appendChild(av);
        el.parentNode.removeChild(el);
      } else {
        wrapper.appendChild(el);
      }
      wrapper.insertAdjacentHTML("beforeend", profileDropHTML);
      wrapper.addEventListener("click", e => {
        e.stopPropagation();
        wrapper.querySelector("#ll-profile-panel")?.classList.toggle("hidden");
        document.querySelector("#ll-notif-panel")?.classList.add("hidden");
      });
    });

    // profile-trigger div
    const pt = header.querySelector("#profile-trigger");
    if (pt && !pt.closest("[id*='ll-profile']")) {
      const wrapper = document.createElement("div");
      wrapper.className = "relative cursor-pointer";
      pt.parentNode.insertBefore(wrapper, pt);
      wrapper.appendChild(pt);
      wrapper.insertAdjacentHTML("beforeend", profileDropHTML);
      wrapper.addEventListener("click", e => {
        e.stopPropagation();
        wrapper.querySelector("#ll-profile-panel")?.classList.toggle("hidden");
        document.querySelector("#ll-notif-panel")?.classList.add("hidden");
      });
    }
  });

  document.addEventListener("click", e => {
    if (e.target.closest && e.target.closest("#ll-profile-logout")) { doLogout(); return; }
    document.querySelectorAll("#ll-notif-panel, #ll-profile-panel").forEach(p=>p.classList.add("hidden"));
  });

})();