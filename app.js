(() => {
  const cfg = window.WISHES_CONFIG;
  const db = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: false }
  });
  const $ = (id) => document.getElementById(id);
  const NAME = cfg.NAME || "her";

  // ---------- Personalise ----------
  $("hero-name").textContent = NAME;
  $("app-title").textContent = `${NAME}'s birthday`;
  $("intro").textContent = cfg.INTRO || "";
  document.title = `Wishes for ${NAME}`;

  const avatar = $("appbar-avatar");
  if (cfg.PHOTO) {
    const img = document.createElement("img");
    img.src = cfg.PHOTO; img.alt = "";
    avatar.append(img);
    $("hero-photo").src = cfg.PHOTO;
    $("hero-photo").alt = NAME;
    $("hero-photo").hidden = false;
  } else {
    avatar.textContent = NAME.charAt(0).toUpperCase();
  }

  let countdownText = "";
  if (cfg.BIRTHDAY) {
    const [y, m, d] = cfg.BIRTHDAY.split("-").map(Number);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const days = Math.round((new Date(y, m - 1, d) - today) / 86400000);
    if (days > 1) countdownText = `${days} days to go`;
    else if (days === 1) countdownText = "Tomorrow!";
    else if (days === 0) countdownText = "Today's the day 🎉";
    if (countdownText) { $("countdown").textContent = countdownText; $("countdown").hidden = false; }
  }
  $("appbar-sub").textContent = "Send your wishes 🎉";

  // Passcode can come from the invite link: ?code=xyz
  const params = new URLSearchParams(location.search);
  if (params.get("code")) {
    $("code").value = params.get("code");
    $("code-field").hidden = true;
    history.replaceState(null, "", location.pathname);
  }

  // ---------- Confetti ----------
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function confetti(count = 120) {
    if (reduceMotion) return;
    const c = $("confetti"), ctx = c.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    c.width = innerWidth * dpr; c.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const colors = ["#f43f5e", "#fb923c", "#facc15", "#22c55e", "#3b82f6", "#a855f7"];
    const bits = Array.from({ length: count }, () => ({
      x: innerWidth / 2, y: innerHeight * .55,
      vx: (Math.random() - .5) * 16, vy: -Math.random() * 15 - 6,
      r: Math.random() * Math.PI, vr: (Math.random() - .5) * .35,
      w: 6 + Math.random() * 5, h: 9 + Math.random() * 6,
      color: colors[(Math.random() * colors.length) | 0]
    }));
    const start = performance.now();
    (function frame(t) {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      for (const b of bits) {
        b.vy += .38; b.vx *= .985; b.x += b.vx; b.y += b.vy; b.r += b.vr;
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.r);
        ctx.fillStyle = b.color;
        ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h * Math.abs(Math.cos(b.r * 2)) + 2);
        ctx.restore();
      }
      if (t - start < 3000) requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, innerWidth, innerHeight);
    })(start);
  }

  // ---------- Compose sheet ----------
  const sheet = $("compose");
  const form = $("wish-form");
  const status = $("status");
  const photoInput = $("photo");
  let photoBlob = null;

  const setStatus = (text, kind = "") => { status.textContent = text; status.className = `status ${kind}`; };

  function openCompose() {
    form.hidden = false; $("sent").hidden = true; $("add-title").hidden = false;
    sheet.showModal();
    setTimeout(() => $("name").focus({ preventScroll: true }), 250);
  }
  $("open-compose").addEventListener("click", openCompose);
  $("close-compose").addEventListener("click", () => sheet.close());
  $("done").addEventListener("click", () => sheet.close());
  sheet.addEventListener("click", (e) => { if (e.target === sheet) sheet.close(); });
  $("another").addEventListener("click", () => {
    $("sent").hidden = true; form.hidden = false; $("add-title").hidden = false;
    $("name").focus();
  });

  $("message").addEventListener("input", (e) => { $("chars").textContent = e.target.value.length; });

  const tile = $("photo-tile");
  const tileIcon = tile.innerHTML;

  photoInput.addEventListener("change", async () => {
    const file = photoInput.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return setStatus("Choose an image file.", "error");
    if (file.size > 25 * 1024 * 1024) return setStatus("That photo is over 25 MB. Choose a smaller one.", "error");
    try {
      $("photo-label").textContent = "Preparing photo…";
      photoBlob = await compressImage(file);
      const img = document.createElement("img");
      img.src = URL.createObjectURL(photoBlob); img.alt = "Selected photo";
      tile.innerHTML = ""; tile.append(img);
      $("photo-label").textContent = "Photo added";
      $("clear-photo").hidden = false;
      setStatus("");
    } catch {
      clearPhoto();
      setStatus("This photo couldn't be read. Try a JPEG or PNG.", "error");
    }
  });

  function clearPhoto() {
    photoBlob = null; photoInput.value = "";
    tile.innerHTML = tileIcon;
    $("photo-label").textContent = "Add a photo";
    $("clear-photo").hidden = true;
  }
  $("clear-photo").addEventListener("click", clearPhoto);

  // Resize to max 1600px and re-encode as JPEG (also strips EXIF/GPS).
  async function compressImage(file, maxDim = 1600, quality = 0.85) {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d").drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    return new Promise((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error("encode"))), "image/jpeg", quality));
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = $("name").value.trim();
    const message = $("message").value.trim();
    const code = $("code").value.trim();
    if (!name) return setStatus("Add your name.", "error");
    if (!message) return setStatus("Write a message before sending.", "error");
    if (!code) { $("code-field").hidden = false; return setStatus("Enter the passcode from the invite.", "error"); }

    $("submit").disabled = true;
    try {
      setStatus("Checking passcode…");
      const { data: ok, error: codeErr } = await db.rpc("check_passcode", { p_code: code });
      if (codeErr) throw codeErr;
      if (!ok) { $("code-field").hidden = false; return setStatus("That passcode doesn't match the invite.", "error"); }

      let photoPath = null;
      if (photoBlob) {
        setStatus("Uploading photo…");
        photoPath = `uploads/${crypto.randomUUID()}.jpg`;
        const { error: upErr } = await db.storage.from(cfg.BUCKET)
          .upload(photoPath, photoBlob, { contentType: "image/jpeg", upsert: false });
        if (upErr) throw upErr;
      }

      setStatus("Sending…");
      const { error } = await db.rpc("submit_wish", {
        p_code: code, p_name: name, p_message: message, p_photo_path: photoPath
      });
      if (error) throw error;

      form.reset(); $("chars").textContent = "0"; clearPhoto(); setStatus("");
      form.hidden = true; $("add-title").hidden = true; $("sent").hidden = false;
      confetti();
    } catch (err) {
      console.error(err);
      setStatus(err?.message || "The wish couldn't be sent. Check your connection and try again.", "error");
    } finally {
      $("submit").disabled = false;
    }
  });

  // ---------- Feed ----------
  const avatarColors = [
    ["#ffe4e8", "#be123c"], ["#ffedd5", "#c2410c"], ["#fef9c3", "#a16207"],
    ["#dcfce7", "#15803d"], ["#dbeafe", "#1d4ed8"], ["#f3e8ff", "#7e22ce"]
  ];
  function colorFor(name) {
    let h = 0; for (const ch of name) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return avatarColors[h % avatarColors.length];
  }
  function timeAgo(iso) {
    const s = (Date.now() - new Date(iso)) / 1000;
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
    return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  }

  function placeholder(title, text, iconPath) {
    const d = document.createElement("div");
    d.className = "placeholder";
    d.innerHTML = `<div class="icon"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPath}</svg></div><strong></strong><p></p>`;
    d.querySelector("strong").textContent = title;
    d.querySelector("p").textContent = text;
    return d;
  }
  const GIFT = '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/>';
  const PEN = '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>';

  async function loadWall() {
    const wall = $("wall");
    const { data, error } = await db
      .from("wishes")
      .select("id, name, message, photo_path, created_at")
      .eq("approved", true)
      .order("created_at", { ascending: false });

    wall.innerHTML = "";
    if (error) {
      wall.append(placeholder("Couldn't load wishes", "Pull down or refresh the page to try again.", GIFT));
      return;
    }

    $("count").textContent = data.length ? `${data.length} ${data.length === 1 ? "wish" : "wishes"} so far` : "";
    if (!data.length) {
      wall.append(placeholder("No wishes yet", "Be the first to write one. Tap the button below.", PEN));
      return;
    }

    const paths = data.map((w) => w.photo_path).filter(Boolean);
    const urls = {};
    if (paths.length) {
      const { data: signed } = await db.storage.from(cfg.BUCKET).createSignedUrls(paths, 60 * 60);
      (signed || []).forEach((s) => { if (s.signedUrl) urls[s.path] = s.signedUrl; });
    }

    data.forEach((w, i) => {
      const card = document.createElement("article");
      card.className = "wish";
      card.style.animationDelay = `${Math.min(i, 8) * 40}ms`;

      const head = document.createElement("div");
      head.className = "wish-head";
      const av = document.createElement("span");
      av.className = "avatar";
      const [bg, fg] = colorFor(w.name);
      av.style.background = bg; av.style.color = fg;
      av.textContent = w.name.trim().charAt(0).toUpperCase();
      const who = document.createElement("div");
      const strong = document.createElement("strong"); strong.textContent = w.name;
      const time = document.createElement("time"); time.dateTime = w.created_at; time.textContent = timeAgo(w.created_at);
      who.append(strong, time);
      head.append(av, who);

      const msg = document.createElement("p");
      msg.className = "msg";
      msg.textContent = w.message;
      card.append(head, msg);

      if (w.photo_path && urls[w.photo_path]) {
        const btn = document.createElement("button");
        btn.type = "button"; btn.className = "wish-photo";
        btn.setAttribute("aria-label", `View photo from ${w.name}`);
        const img = document.createElement("img");
        img.src = urls[w.photo_path]; img.alt = `Photo from ${w.name}`; img.loading = "lazy";
        btn.append(img);
        btn.addEventListener("click", () => openLightbox(img.src, img.alt));
        card.append(btn);
      }
      wall.append(card);
    });
  }

  const lb = $("lightbox");
  function openLightbox(src, alt) { $("lightbox-img").src = src; $("lightbox-img").alt = alt; lb.showModal(); }
  $("lightbox-close").addEventListener("click", () => lb.close());
  lb.addEventListener("click", (e) => { if (e.target === lb) lb.close(); });

  if (cfg.SHOW_WALL === false) {
    $("wall").innerHTML = "";
    $("wall").append(placeholder("Wishes are a surprise",
      `Everyone's wishes will appear here on ${NAME}'s birthday. Add yours now!`, GIFT));
  } else {
    loadWall();
  }
})();
