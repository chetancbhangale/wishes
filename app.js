(() => {
  const cfg = window.WISHES_CONFIG;
  const db = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: false }
  });
  const $ = (id) => document.getElementById(id);

  // ---------- Personalise ----------
  $("headline").textContent = `Happy birthday, ${cfg.NAME}`;
  $("intro").textContent = cfg.INTRO;
  document.title = `Wishes for ${cfg.NAME}`;

  // Passcode can come from the invite link: index.html?code=xyz
  const params = new URLSearchParams(location.search);
  if (params.get("code")) {
    $("code").value = params.get("code");
    $("code-field").hidden = true;
    history.replaceState(null, "", location.pathname); // keep it out of the address bar
  }

  // ---------- Form ----------
  const form = $("wish-form");
  const status = $("status");
  const photoInput = $("photo");
  let photoBlob = null;

  const setStatus = (text, kind = "") => {
    status.textContent = text;
    status.className = `status ${kind}`;
  };

  $("message").addEventListener("input", (e) => {
    $("chars").textContent = e.target.value.length;
  });

  photoInput.addEventListener("change", async () => {
    const file = photoInput.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setStatus("Choose an image file (JPEG, PNG, HEIC or WebP).", "error");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setStatus("That photo is over 25 MB. Choose a smaller one.", "error");
      return;
    }
    try {
      setStatus("Preparing photo…");
      photoBlob = await compressImage(file);
      $("preview").src = URL.createObjectURL(photoBlob);
      $("preview").hidden = false;
      $("clear-photo").hidden = false;
      setStatus("");
    } catch {
      photoBlob = null;
      setStatus("This photo couldn't be read. Try a JPEG or PNG.", "error");
    }
  });

  $("clear-photo").addEventListener("click", () => {
    photoBlob = null;
    photoInput.value = "";
    $("preview").hidden = true;
    $("clear-photo").hidden = true;
  });

  // Resize to max 1600px and re-encode as JPEG. Re-encoding through a canvas
  // drops EXIF metadata, including GPS location.
  async function compressImage(file, maxDim = 1600, quality = 0.85) {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    return new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode"))), "image/jpeg", quality)
    );
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = $("name").value.trim();
    const message = $("message").value.trim();
    const code = $("code").value.trim();

    if (!name) return setStatus("Add your name.", "error");
    if (!message) return setStatus("Write a wish before sending.", "error");
    if (!code) return setStatus("Enter the passcode from the invite.", "error");

    $("submit").disabled = true;
    try {
      setStatus("Checking passcode…");
      const { data: ok, error: codeErr } = await db.rpc("check_passcode", { p_code: code });
      if (codeErr) throw codeErr;
      if (!ok) {
        $("code-field").hidden = false;
        return setStatus("That passcode doesn't match. Check the invite and try again.", "error");
      }

      let photoPath = null;
      if (photoBlob) {
        setStatus("Uploading photo…");
        photoPath = `uploads/${crypto.randomUUID()}.jpg`;
        const { error: upErr } = await db.storage
          .from(cfg.BUCKET)
          .upload(photoPath, photoBlob, { contentType: "image/jpeg", upsert: false });
        if (upErr) throw upErr;
      }

      setStatus("Sending wish…");
      const { error } = await db.rpc("submit_wish", {
        p_code: code, p_name: name, p_message: message, p_photo_path: photoPath
      });
      if (error) throw error;

      form.reset();
      $("chars").textContent = "0";
      $("clear-photo").click();
      setStatus("");
      form.hidden = true;
      $("sent").hidden = false;
    } catch (err) {
      console.error(err);
      setStatus(err?.message || "The wish couldn't be sent. Check your connection and try again.", "error");
    } finally {
      $("submit").disabled = false;
    }
  });

  $("another").addEventListener("click", () => {
    $("sent").hidden = true;
    form.hidden = false;
    $("name").focus();
  });

  // ---------- Wall of approved wishes ----------
  async function loadWall() {
    const wall = $("wall");
    const { data, error } = await db
      .from("wishes")
      .select("id, name, message, photo_path, created_at")
      .eq("approved", true)
      .order("created_at", { ascending: false });

    if (error) {
      wall.innerHTML = "";
      wall.append(emptyBox("The wishes couldn't be loaded. Refresh the page to try again."));
      return;
    }

    const paths = data.map((w) => w.photo_path).filter(Boolean);
    const urls = {};
    if (paths.length) {
      const { data: signed } = await db.storage.from(cfg.BUCKET).createSignedUrls(paths, 60 * 60);
      (signed || []).forEach((s) => { if (s.signedUrl) urls[s.path] = s.signedUrl; });
    }

    $("count").textContent = data.length ? `${data.length} ${data.length === 1 ? "wish" : "wishes"}` : "";
    wall.innerHTML = "";
    if (!data.length) {
      wall.append(emptyBox("No wishes on the wall yet. Be the first to write one."));
      return;
    }

    for (const w of data) {
      const note = document.createElement("article");
      note.className = "note";

      if (w.photo_path && urls[w.photo_path]) {
        const fig = document.createElement("figure");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.setAttribute("aria-label", `View photo from ${w.name}`);
        const img = document.createElement("img");
        img.src = urls[w.photo_path];
        img.alt = `Photo from ${w.name}`;
        img.loading = "lazy";
        btn.append(img);
        btn.addEventListener("click", () => openLightbox(img.src, img.alt));
        fig.append(btn);
        note.append(fig);
      }

      const msg = document.createElement("p");
      msg.className = "msg";
      msg.textContent = w.message;          // textContent: no HTML injection
      const from = document.createElement("p");
      from.className = "from";
      from.textContent = `— ${w.name}`;
      note.append(msg, from);
      wall.append(note);
    }
  }

  function emptyBox(text) {
    const d = document.createElement("div");
    d.className = "empty";
    d.textContent = text;
    return d;
  }

  const lb = $("lightbox");
  function openLightbox(src, alt) {
    $("lightbox-img").src = src;
    $("lightbox-img").alt = alt;
    lb.showModal();
  }
  $("lightbox-close").addEventListener("click", () => lb.close());
  lb.addEventListener("click", (e) => { if (e.target === lb) lb.close(); });

  if (cfg.SHOW_WALL === false) {
    document.querySelector(".wall-head").hidden = true;
    $("wall").hidden = true;
  } else {
    loadWall();
  }
})();
