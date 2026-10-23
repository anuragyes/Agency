require("dotenv").config({ path: process.cwd() + "/.env", quiet: true });
const axios = require("axios");
const t = process.env.INSTAGRAM_ACCESS_TOKEN, id = process.env.INSTAGRAM_USER_ID;
const tryIt = async (label, url, fields) => {
  try { const r = await axios.get(url, { params: { fields, access_token: t } }); console.log(label, "OK", JSON.stringify(r.data)); }
  catch (e) { console.log(label, "FAIL", e.response?.status, JSON.stringify(e.response?.data || e.message)); }
};

// imedidate function which is no need to call the function automatcally call 
(async () => {
  await tryIt("FB graph /{id}", `https://graph.facebook.com/v26.0/${id}`, "id,username,followers_count");
  await tryIt("IG graph /me", `https://graph.instagram.com/me`, "user_id,username,followers_count");
  await tryIt("IG graph /{id}", `https://graph.instagram.com/${id}`, "id,username,followers_count");
})();
