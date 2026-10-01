(() => {
  const cfg = window.WISHES_CONFIG;
  const db = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  const $ = (id) => document.getElementById(id);

  let wishes = [];
  let filter = "pending";

  const show = (view) => {
    $("login-view").hidden = view !== "login";
    $("admin-view").hidden = view !== "admin";
  };

  const setStatus = (el, text, kind = "") => {
    el.textContent = text;
    el.className = `status ${kind}`;
  };

  // ---------- Auth ----------
  async function start() {
    const { data: { session } } = await db.auth.getSession();
    if (!session) return show("login");
    await enterAdmin();
  }

  async function enterAdmin() {
    const { data: isAdmin, error } = await db.rpc("is_admin");
    if (error || !isAdmin) {
      await db.auth.signOut();
      show("login");
      return setStatus($("login-status"), "This account isn't an admin for this site.", "error");
    }
    show("admin");
    await load();
  }

  $("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("login-btn").disabled = true;
    setStatus($("login-status"), "Signing in…");
    const { error } = await db.auth.signInWithPassword({
      email: $("email").value.trim(),
      password: $("password").value
    });
    $("login-btn").disabled = false;
    if (error) return setStatus($("login-status"), "Email or password is incorrect.", "error");
    $("password").value = "";
    setStatus($("login-status"), "");
    await enterAdmin();
  });

  $("logout").addEventListener("click", async () => {
    await db.auth.signOut();
    wishes = [];
    $("list").innerHTML = "";
    show("login");
  });

  // ---------- Data ----------
  async function load() {
    setStatus($("admin-status"), "Loading…");
    const { data, error } = await db
      .from("wishes")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return setStatus($("admin-status"), `Couldn't load wishes: ${error.message}`, "error");

    wishes = data;
    const paths = wishes.map((w) => w.photo_path).filter(Boolean);
    if (paths.length) {
      const { data: signed } = await db.storage.from(cfg.BUCKET).createSignedUrls(paths, 60 * 30);
      const urls = Object.fromEntries((signed || []).filter((s) => s.signedUrl).map((s) => [s.path, s.signedUrl]));
      wishes.forEach((w) => { w._url = urls[w.photo_path] || null; });
    }
    setStatus($("admin-status"), "");
    render();
  }

  function render() {
    const pending = wishes.filter((w) => !w.approved);
    const approved = wishes.filter((w) => w.approved);
    $("n-pending").textContent = `(${pending.length})`;
    $("n-approved").textContent = `(${approved.length})`;

    const list = $("list");
    list.innerHTML = "";
    const items = filter === "pending" ? pending : approved;

    if (!items.length) {
      const d = document.createElement("div");
      d.className = "empty";
      d.textContent = filter === "pending"
        ? "Nothing waiting for approval. New wishes will show up here."
        : "No wishes on the wall yet. Approve one from the waiting list.";
      list.append(d);
      return;
    }

    for (const w of items) list.append(card(w));
  }

  function card(w) {
    const el = document.createElement("article");
    el.className = `mod-card ${w.approved ? "" : "pending"}`;

    if (w.photo_path) {
      if (w._url) {
        const img = document.createElement("img");
        img.src = w._url;
        img.alt = `Photo from ${w.name}`;
        img.loading = "lazy";
        el.append(img);
      } else {
        const missing = document.createElement("p");
        missing.className = "mod-meta";
        missing.textContent = "Photo attached but not found in storage.";
        el.append(missing);
      }
    }

    const body = document.createElement("div");
    body.className = "mod-body";

    const badge = document.createElement("span");
    badge.className = `badge ${w.approved ? "live" : ""}`;
    badge.textContent = w.approved ? "On the wall" : "Waiting";

    const msg = document.createElement("p");
    msg.className = "msg";
    msg.textContent = w.message;

    const meta = document.createElement("p");
    meta.className = "mod-meta";
    meta.textContent = `From ${w.name}, ${new Date(w.created_at).toLocaleString()}`;

    const actions = document.createElement("div");
    actions.className = "mod-actions";
    if (w.approved) {
      actions.append(button("Remove from wall", "ghost", () => setApproved(w, false)));
    } else {
      actions.append(button("Approve", "marigold", () => setApproved(w, true)));
    }
    actions.append(button("Delete", "danger", () => remove(w)));

    body.append(badge, msg, meta, actions);
    el.append(body);
    return el;
  }

  function button(label, style, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `btn small ${style}`;
    b.textContent = label;
    b.addEventListener("click", async () => {
      b.disabled = true;
      try { await onClick(); } finally { b.disabled = false; }
    });
    return b;
  }

  async function setApproved(w, approved) {
    const { error } = await db
      .from("wishes")
      .update({ approved, approved_at: approved ? new Date().toISOString() : null })
      .eq("id", w.id);
    if (error) return setStatus($("admin-status"), `Couldn't update: ${error.message}`, "error");
    w.approved = approved;
    setStatus($("admin-status"), approved ? `Approved wish from ${w.name}.` : `Removed wish from ${w.name} from the wall.`, "ok");
    render();
  }

  async function remove(w) {
    if (!confirm(`Delete the wish from ${w.name}${w.photo_path ? " and its photo" : ""}? This can't be undone.`)) return;
    if (w.photo_path) {
      const { error: stErr } = await db.storage.from(cfg.BUCKET).remove([w.photo_path]);
      if (stErr) return setStatus($("admin-status"), `Couldn't delete the photo: ${stErr.message}`, "error");
    }
    const { error } = await db.from("wishes").delete().eq("id", w.id);
    if (error) return setStatus($("admin-status"), `Couldn't delete: ${error.message}`, "error");
    wishes = wishes.filter((x) => x.id !== w.id);
    setStatus($("admin-status"), `Deleted wish from ${w.name}.`, "ok");
    render();
  }

  // ---------- Tabs ----------
  document.querySelectorAll("[data-filter]").forEach((b) => {
    b.addEventListener("click", () => {
      filter = b.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach((x) =>
        x.setAttribute("aria-pressed", String(x === b)));
      render();
    });
  });
  $("refresh").addEventListener("click", load);

  start();
})();
