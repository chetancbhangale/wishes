// Fill these in from Supabase Dashboard > Project Settings > API.
// The anon key is designed to be public; the database rules in schema.sql
// are what keep pending wishes and photos private. Never put the
// service_role key here.
window.WISHES_CONFIG = {
  SUPABASE_URL: "https://rukvlpywpptfhmiukcpl.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_V6XfpbWxUKUMO1kitU6rMQ_3mS6sN-U",

  // Personalise the page
  NAME: "Neha",
  INTRO: "Leave a wish, a memory, or a photo for her birthday.",

  // false = friends can only submit; the wall stays hidden until you
  // switch this to true (e.g. on the birthday) and re-upload config.js.
  SHOW_WALL: true,

  BUCKET: "wish-photos"
};
