# Birthday wishes wall

Friends submit wishes and photos with a shared passcode. Nothing appears
publicly until you approve it in `admin.html`.

## Files

| File | Purpose |
|---|---|
| `index.html`, `app.js` | Public page: submit form + wall of approved wishes |
| `admin.html`, `admin.js` | Your moderation page (sign-in required) |
| `config.js` | Supabase URL/key, her name, show/hide wall |
| `styles.css` | Shared styles (light and dark mode) |
| `schema.sql` | Database tables, security rules, photo storage |

## Setup (about 15 minutes)

1. **Create a Supabase project** at supabase.com (free tier is plenty).
   Pick the Mumbai (ap-south-1) region for speed.

2. **Run the schema.** Dashboard > SQL Editor > paste all of `schema.sql` > Run.

3. **Create your admin login.** Authentication > Users > Add user >
   enter your email and a strong password, tick "Auto confirm".

4. **Turn off public sign-ups.** Authentication > Sign In / Providers >
   disable "Allow new users to sign up". (Only your account should exist.)

5. **Set the passcode and make yourself admin.** In SQL Editor:

   ```sql
   insert into public.app_settings (id, passcode_hash)
   values (1, extensions.crypt('your-passcode', extensions.gen_salt('bf')))
   on conflict (id) do update set passcode_hash = excluded.passcode_hash;

   insert into public.admins (user_id)
   select id from auth.users where email = 'you@example.com';
   ```

6. **Fill in `config.js`** from Project Settings > API: the Project URL and
   the `anon` public key. Never use the `service_role` key in these files.
   Set `NAME` to her name.

7. **Deploy.** Easiest: drag the folder onto app.netlify.com/drop.
   GitHub Pages or Cloudflare Pages work the same way.

8. **Share** `https://your-site/?code=your-passcode` with friends. The code
   fills itself in and disappears from the address bar.
   Keep `admin.html` to yourself.

## What protects what

- **Pending wishes and photos are private.** Database rules let the public
  read only approved rows. Photos sit in a private bucket and are served
  through 1-hour signed links only after approval.
- **Only you can approve, unpublish or delete**, enforced in the database
  (not just hidden buttons), via the `admins` table.
- **Guests can't edit or delete anything**, including their own posts.
- **Passcode is checked on the server** and stored as a bcrypt hash.
- **Photos are resized to 1600px and re-encoded**, which strips EXIF
  metadata including GPS location. Only JPEG up to 5 MB is accepted.
- **No HTML injection:** messages render as plain text, and a strict
  Content-Security-Policy limits scripts to the site and jsDelivr.
- **Not indexed** by search engines (`noindex`).

## Good to know

- **Keep it a surprise:** set `SHOW_WALL: false` until the birthday, then
  flip to `true` and redeploy. You can still review everything in admin.
- **Change the passcode** any time by re-running the step 5 `insert`.
- **Orphan photos:** if someone uploads a photo but the submit fails, the
  file stays private and unused. Clean up under Storage > wish-photos if
  you like.
- **Free-tier pause:** Supabase pauses projects after about a week with no
  activity. Visit the dashboard to resume it if needed.
- **Afterwards:** download the photos from Storage, then pause or delete the
  project, or set `SHOW_WALL: false`.
