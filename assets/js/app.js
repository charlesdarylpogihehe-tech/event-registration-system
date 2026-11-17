async function main() {
  const page = document.body.dataset.page;

  if (!requireConfigured()) return;

  // Display navigation immediately.
  nav(null, null);

  // Load public homepage events independently of login checks.
  if (page === "home") {
    home().catch((error) => {
      console.error("Homepage loading error:", error);
      notify(error.message || "Unable to load events.", true);
    });
  }

  try {
    const user = await getUser();

    window.__user = Boolean(user);
    window.__admin = false;
    window.__student = false;

    if (user) {
      const [admin, studentProfileData] = await Promise.all([
        isAdmin(user),
        studentProfile(user)
      ]);

      window.__admin = admin;
      window.__student = Boolean(studentProfileData);
    }

    // Update navigation after checking account permissions.
    nav(user, null);

    if (page === "home") return;

    if (page === "login" || page === "admin-login") {
      return login();
    }

    if (page === "register") {
      return register();
    }

    if (page === "student-dashboard" || page === "event-detail") {
      if (!user) {
        return window.location.replace("../login.html");
      }

      if (!window.__student || window.__admin) {
        return window.location.replace("../index.html");
      }

      const prof = await studentProfile(user);

      if (page === "student-dashboard") {
        return studentDashboard(user, prof);
      }

      return eventDetail(user);
    }

    if (["admin-dashboard", "event-form", "participants"].includes(page)) {
      if (!user) {
        return window.location.replace("../admin-login.html");
      }

      if (!window.__admin) {
        return window.location.replace("../index.html");
      }

      if (page === "admin-dashboard") return adminDashboard();
      if (page === "event-form") return eventForm();

      return participants();
    }

  } catch (error) {
    console.error("Application startup error:", error);
    notify(error.message || "Application startup failed.", true);
  }
}
