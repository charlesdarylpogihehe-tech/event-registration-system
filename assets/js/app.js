import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const configured =
  SUPABASE_URL &&
  SUPABASE_ANON_KEY &&
  !SUPABASE_URL.includes("YOUR-PROJECT") &&
  !SUPABASE_ANON_KEY.includes("YOUR_SUPABASE");

const supabase = configured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  : null;

const $ = (selector) => document.querySelector(selector);
const esc = (value = "") =>
  String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));

const dateFmt = (date) =>
  date ? new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric"
  }) : "";

const timeFmt = (time) =>
  time ? new Date(`1970-01-01T${time}`).toLocaleTimeString(undefined, {
    hour: "numeric", minute: "2-digit"
  }) : "";

function notify(message, isError = false) {
  const element = $("#toast");
  if (!element) {
    window.alert(message);
    return;
  }
  element.hidden = false;
  element.textContent = message;
  element.className = isError ? "alert" : "alert success";
  element.scrollIntoView({ behavior: "smooth", block: "center" });
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

async function getUser() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error) console.error("Unable to get current user:", error.message);
  return data?.user || null;
}

async function studentProfile(user) {
  if (!user) return null;
  const { data, error } = await supabase.from("student_profiles")
    .select("id, full_name, email").eq("id", user.id).maybeSingle();
  if (error) { console.error("Student profile lookup failed:", error.message); return null; }
  return data;
}

async function isAdmin(user) {
  if (!user) return false;
  const { data, error } = await supabase.from("admin_accounts")
    .select("id").eq("id", user.id).maybeSingle();
  if (error) { console.error("Admin account lookup failed:", error.message); return false; }
  return Boolean(data);
}

function pageRoot() {
  const page = document.body.dataset.page || "";
  return page.startsWith("student") || page.startsWith("admin") ||
    ["event-detail", "event-form", "participants"].includes(page) ? "../" : "";
}

function nav(user, prof) {
  const root = pageRoot();
  const links = user
    ? `${window.__admin === true ? `<a href="${root}admin/dashboard.html">ADMINISTRATION</a>` : ""}
       ${window.__student === true ? `<a href="${root}student/dashboard.html">MY REGISTRATIONS</a>` : ""}
       <a href="#" id="logout-link">LOG OUT</a>`
    : `<a href="${root}login.html">STUDENT LOGIN</a><a href="${root}admin-login.html">ADMIN LOGIN</a><a href="${root}register.html">STUDENT SIGN UP</a>`;

  const element = $("#site-nav");
  if (!element) return;

  element.innerHTML = `
    <nav class="navbar">
      <div class="brand-wrap">
        <div class="brand-seal"><img src="${root}assets/uep-seal.jpg" alt="University emblem"></div>
        <div class="brand">UNIVERSITY EVENT PORTAL<small>STUDENT ACTIVITIES & CAMPUS LIFE</small></div>
      </div>
      <div class="navlinks"><a href="${root}index.html">HOME</a>${links}</div>
    </nav>`;

  $("#logout-link")?.addEventListener("click", async (event) => {
    event.preventDefault();
    const { error } = await supabase.auth.signOut();
    if (error) return notify(error.message, true);
    window.location.href = `${root}index.html`;
  });
}

function requireConfigured() {
  if (supabase) return true;
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<div class="alert">Setup required: open <b>assets/js/config.js</b> and enter your Supabase Project URL and anon/public key.</div>`
  );
  return false;
}

async function home() {
  const [{ data: events, error }, { data: counts, error: countError }] =
    await Promise.all([
      supabase.from("events").select("*").order("event_date").order("event_time"),
      supabase.rpc("get_event_registration_counts")
    ]);

  const list = $("#events-list");
  if (error) {
    list.innerHTML = `<div class="card">${esc(error.message)}</div>`;
    return;
  }
  if (countError) console.warn("Registration counts unavailable:", countError.message);

  const countMap = new Map((counts || []).map((row) => [
    String(row.event_id), Number(row.registered_count)
  ]));

  if (!events?.length) {
    list.innerHTML = '<div class="card"><h3>No events posted yet</h3><p class="muted">Please check again soon.</p></div>';
    return;
  }

  list.innerHTML = events.map((event) => {
    const count = countMap.get(String(event.id)) || 0;
    const remaining = Math.max(0, Number(event.capacity) - count);
    const destination = window.__user
      ? `student/event.html?id=${encodeURIComponent(event.id)}`
      : "login.html";

    return `<article class="card">
      <span class="badge">${dateFmt(event.event_date)}</span>
      <h3>${esc(event.title)}</h3>
      <p>${esc(event.description)}</p>
      <p class="muted"><strong>Time:</strong> ${timeFmt(event.event_time)}<br>
      <strong>Venue:</strong> ${esc(event.location)}<br>
      <strong>Available slots:</strong> ${remaining} / ${Number(event.capacity)}</p>
      <a class="btn" href="${destination}">${window.__user ? "EVENT DETAILS" : "LOGIN TO REGISTER"}</a>
    </article>`;
  }).join("");
}

async function login() {
  const adminLogin = document.body.dataset.page === "admin-login";
  $("#login-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = formData(event.currentTarget);
    const button = event.currentTarget.querySelector('button[type="submit"], button:not([type])');
    if (button) button.disabled = true;
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: form.email.trim().toLowerCase(), password: form.password });
      if (error) return notify(error.message, true);
      const user = await getUser();
      if (!user) return notify("Unable to load your login session.", true);
      if (adminLogin) {
        if (!(await isAdmin(user))) {
          await supabase.auth.signOut();
          return notify("This account is not authorized as an administrator. Contact the system administrator.", true);
        }
        window.location.href = "admin/dashboard.html";
      } else {
        if (await isAdmin(user)) {
          await supabase.auth.signOut();
          return notify("This is an administrator account. Please use the Administrator Login page.", true);
        }
        if (!(await studentProfile(user))) {
          await supabase.auth.signOut();
          return notify("Student profile not found. Please contact the system administrator.", true);
        }
        window.location.href = "student/dashboard.html";
      }
    } catch (error) {
      console.error("Login failed:", error);
      notify(error.message || "Login failed.", true);
    } finally { if (button) button.disabled = false; }
  });
}

async function register() {
  $("#register-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = formData(event.currentTarget);
    const fullName = (form.full_name || "").trim();
    const email = (form.email || "").trim().toLowerCase();

    if (!fullName) return notify("Please enter your full name.", true);
    if (form.password !== form.confirm_password) {
      return notify("Passwords do not match.", true);
    }
    if ((form.password || "").length < 6) {
      return notify("Your password must contain at least 6 characters.", true);
    }

    const button = event.currentTarget.querySelector('button[type="submit"], button:not([type])');
    if (button) button.disabled = true;

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password: form.password,
        options: {
          data: { full_name: fullName }
        }
      });

      if (error) return notify(error.message, true);

      // The database trigger creates the matching public.student_profiles row.
      // Never accept a role from the browser; new sign-ups are students.
      if (data.session && data.user) {
        const { data: prof, error: profileError } = await supabase
          .from("student_profiles")
          .select("id")
          .eq("id", data.user.id)
          .maybeSingle();

        if (profileError || !prof) {
          return notify(
            "Your Auth account was created, but its student profile is missing. Run supabase-setup.sql in Supabase SQL Editor. Do not sign up again yet.",
            true
          );
        }

        window.location.href = "student/dashboard.html";
        return;
      }

      event.currentTarget.reset();
      notify("Student account created. Check your email to confirm your account, then return here to log in.");
    } catch (error) {
      console.error("Student sign-up failed:", error);
      notify(error.message || "Student sign-up failed. Please try again.", true);
    } finally {
      if (button) button.disabled = false;
    }
  });
}

async function studentDashboard(user, prof) {
  $("#welcome").textContent = `Welcome, ${prof?.full_name || user.email}`;

  const { data, error } = await supabase
    .from("registrations")
    .select("id, registered_at, events(id, title, event_date, event_time, location)")
    .eq("user_id", user.id)
    .order("registered_at", { ascending: false });

  if (error) return notify(error.message, true);

  $("#my-registrations").innerHTML = data?.length
    ? data.map((registration) => `<tr>
        <td>${esc(registration.events?.title || "Event unavailable")}</td>
        <td>${dateFmt(registration.events?.event_date)}</td>
        <td>${timeFmt(registration.events?.event_time)}</td>
        <td>${esc(registration.events?.location || "")}</td>
        <td><button class="btn danger small" data-cancel="${registration.id}">Cancel</button></td>
      </tr>`).join("")
    : '<tr><td colspan="5">You have no registrations yet. <a href="../index.html">View events</a>.</td></tr>';

  $("#my-registrations").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-cancel]");
    if (!button) return;
    if (!window.confirm("Cancel this registration?")) return;

    const { error: deleteError } = await supabase
      .from("registrations")
      .delete()
      .eq("id", button.dataset.cancel)
      .eq("user_id", user.id);

    if (deleteError) notify(deleteError.message, true);
    else window.location.reload();
  });
}

async function eventDetail(user) {
  const id = new URLSearchParams(window.location.search).get("id");
  const box = $("#event-detail");
  if (!id || !/^\d+$/.test(id)) {
    box.textContent = "No valid event was selected.";
    return;
  }

  const { data: event, error } = await supabase
    .from("events").select("*").eq("id", id).single();

  if (error || !event) {
    box.textContent = "Event not found.";
    return;
  }

  const [{ data: countRows }, { data: mine, error: mineError }] = await Promise.all([
    supabase.rpc("get_event_registration_counts"),
    supabase.from("registrations").select("id")
      .eq("event_id", id).eq("user_id", user.id).maybeSingle()
  ]);

  if (mineError) return notify(mineError.message, true);

  const count = Number(countRows?.find((row) => String(row.event_id) === String(event.id))?.registered_count || 0);
  const remaining = Math.max(0, Number(event.capacity) - count);

  box.innerHTML = `<span class="badge">${dateFmt(event.event_date)}</span>
    <h2>${esc(event.title)}</h2><p>${esc(event.description)}</p>
    <p><strong>Date:</strong> ${dateFmt(event.event_date)}<br>
    <strong>Time:</strong> ${timeFmt(event.event_time)}<br>
    <strong>Location:</strong> ${esc(event.location)}<br>
    <strong>Available slots:</strong> ${remaining}</p>
    ${mine
      ? '<div class="alert success">You are already registered for this event.</div>'
      : remaining <= 0
        ? '<div class="alert">This event is full.</div>'
        : '<button class="btn" id="register-event">Register for Event</button>'}`;

  $("#register-event")?.addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    const { error: registrationError } = await supabase.rpc("register_for_event", {
      p_event_id: Number(id)
    });
    if (registrationError) {
      notify(registrationError.message, true);
      event.currentTarget.disabled = false;
    } else {
      notify("Registration successful!");
      await eventDetail(user);
    }
  });
}

async function adminDashboard() {
  const [
    { count: students, error: studentsError },
    { data: events, error: eventsError },
    { count: registrations, error: registrationsError }
  ] = await Promise.all([
    supabase.from("student_profiles").select("id", { count: "exact", head: true }),
    supabase.from("events").select("*").order("event_date", { ascending: false }),
    supabase.from("registrations").select("id", { count: "exact", head: true })
  ]);

  const error = studentsError || eventsError || registrationsError;
  if (error) return notify(error.message, true);

  $("#student-count").textContent = students ?? 0;
  $("#event-count").textContent = events?.length ?? 0;
  $("#registration-count").textContent = registrations ?? 0;

  const { data: counts, error: countError } = await supabase.rpc("get_event_registration_counts");
  if (countError) return notify(countError.message, true);

  const countMap = new Map((counts || []).map((row) => [
    String(row.event_id), Number(row.registered_count)
  ]));

  $("#admin-events").innerHTML = (events || []).map((event) => {
    const registered = countMap.get(String(event.id)) || 0;
    return `<tr>
      <td>${esc(event.title)}</td>
      <td>${dateFmt(event.event_date)}</td>
      <td>${esc(event.location)}</td>
      <td>${registered} / ${Number(event.capacity)}</td>
      <td class="actions">
        <a class="btn small" href="participants.html?id=${event.id}">Participants</a>
        <a class="btn secondary small" href="edit-event.html?id=${event.id}">Edit</a>
        <button class="btn danger small" data-delete="${event.id}">Delete</button>
      </td>
    </tr>`;
  }).join("") || '<tr><td colspan="5">No events yet.</td></tr>';

  $("#admin-events").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-delete]");
    if (!button) return;
    if (!window.confirm("Delete this event and its registrations?")) return;

    const { error: deleteError } = await supabase
      .from("events").delete().eq("id", button.dataset.delete);

    if (deleteError) notify(deleteError.message, true);
    else window.location.reload();
  });
}

async function eventForm() {
  const id = new URLSearchParams(window.location.search).get("id");
  const editing = Boolean(id);

  if (editing) {
    $("#event-form-title").textContent = "Edit Event";
    const { data, error } = await supabase.from("events").select("*").eq("id", id).single();
    if (error) return notify(error.message, true);

    for (const [key, value] of Object.entries(data)) {
      const input = $(`[name="${key}"]`);
      if (input) input.value = value ?? "";
    }
  }

  $("#event-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = formData(event.currentTarget);
    values.capacity = Number(values.capacity);

    const result = editing
      ? await supabase.from("events").update(values).eq("id", id)
      : await supabase.from("events").insert(values);

    if (result.error) return notify(result.error.message, true);
    window.location.href = "dashboard.html";
  });
}

async function participants() {
  const id = new URLSearchParams(window.location.search).get("id");
  if (!id || !/^\d+$/.test(id)) return notify("Invalid event ID.", true);

  const [
    { data: event, error: eventError },
    { data: rows, error: rowsError }
  ] = await Promise.all([
    supabase.from("events").select("title").eq("id", id).single(),
    supabase.from("registrations")
      .select("registered_at, student_profiles(full_name, email)")
      .eq("event_id", id)
      .order("registered_at")
  ]);

  if (eventError || rowsError) return notify((eventError || rowsError).message, true);

  $("#participants-title").textContent = `${event.title} — ${rows.length} participant(s)`;
  $("#participants-list").innerHTML = rows.map((row, index) => `<tr>
    <td>${index + 1}</td>
    <td>${esc(row.student_profiles?.full_name || "")}</td>
    <td>${esc(row.student_profiles?.email || "")}</td>
    <td>${new Date(row.registered_at).toLocaleString()}</td>
  </tr>`).join("") || '<tr><td colspan="4">No participants registered yet.</td></tr>';
}

async function main() {
  const page = document.body.dataset.page;
  if (!requireConfigured()) return;
  const user = await getUser();
  const admin = await isAdmin(user);
  const student = user ? Boolean(await studentProfile(user)) : false;
  window.__user = Boolean(user);
  window.__admin = admin;
  window.__student = student;
  nav(user, null);
  if (page === "home") return home();
  if (page === "login" || page === "admin-login") return login();
  if (page === "register") return register();
  if (page === "student-dashboard" || page === "event-detail") {
    if (!user) return window.location.replace("../login.html");
    if (!student || admin) return window.location.replace("../index.html");
    const prof = await studentProfile(user);
    if (page === "student-dashboard") return studentDashboard(user, prof);
    return eventDetail(user);
  }
  if (["admin-dashboard", "event-form", "participants"].includes(page)) {
    if (!user) return window.location.replace("../admin-login.html");
    if (!admin) return window.location.replace("../index.html");
    if (page === "admin-dashboard") return adminDashboard();
    if (page === "event-form") return eventForm();
    return participants();
  }
}

main().catch((error) => {
  console.error("Application error:", error);
  notify(error.message || "An unexpected error occurred.", true);
});
