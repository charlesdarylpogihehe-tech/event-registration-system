async function register() {
  const registerForm = document.querySelector("#register-form");

  if (!registerForm) return;

  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    // Keep a reference to the form before the async operation.
    const formElement = event.currentTarget;
    const form = formData(formElement);

    const fullName = (form.full_name || "").trim();
    const email = (form.email || "").trim().toLowerCase();

    if (!fullName) {
      return notify("Please enter your full name.", true);
    }

    if (!email) {
      return notify("Please enter your email address.", true);
    }

    if (form.password !== form.confirm_password) {
      return notify("Passwords do not match.", true);
    }

    if ((form.password || "").length < 6) {
      return notify(
        "Your password must contain at least 6 characters.",
        true
      );
    }

    const button = formElement.querySelector(
      'button[type="submit"], button:not([type])'
    );

    if (button) button.disabled = true;

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password: form.password,
        options: {
          data: {
            full_name: fullName
          }
        }
      });

      if (error) {
        console.error("Supabase sign-up error:", error);
        return notify(error.message, true);
      }

      if (data.session && data.user) {
        const { data: student, error: profileError } =
          await supabase
            .from("student_profiles")
            .select("id")
            .eq("id", data.user.id)
            .maybeSingle();

        if (profileError || !student) {
          console.error("Student profile error:", profileError);

          return notify(
            "Account created, but student profile was not found. Please check your Supabase database setup.",
            true
          );
        }

        window.location.href = "student/dashboard.html";
        return;
      }

      // Corrected: use the saved form reference.
      formElement.reset();

      notify(
        "Student account created successfully! Please check your email to confirm your account before logging in."
      );

    } catch (error) {
      console.error("Registration failed:", error);

      notify(
        error.message || "Student registration failed.",
        true
      );

    } finally {
      if (button) button.disabled = false;
    }
  });
}
