# White-label app — client ka apna app Play Store par

1. Admin panel → Platform → us centre par **White-label app → Configure**: App name, Package id (jaise `in.nextedge.sharmaclasses`), rang, logo PNG ka URL → Save → **Copy build variables**.
2. Codemagic → coaching-connect → workflow **White-label release** → Start new build → Environment variables mein paste karein → Start.
3. 10–15 min mein `.aab` (Play Store ke liye) aur `.apk` (seedha install) mil jaayega (email bhi aayega).
4. Play Store par daalna:
   - **Hum daalein:** Boom Bites ke Play Console (ek baar $25) se, client ka naam app ke naam mein; developer name "Boom Bites" dikhega.
   - **Client khud daale:** client apna Play Console banaye (₹2,100 ek baar), hum `.aab` + icon + screenshots + privacy policy link dete hain. Developer name client ka hoga.
5. Signing: Codemagic → Code signing identities → Android keystore (har client ke liye alag keystore, safe rakhein — isse hi updates jaate hain).
6. App mein login: sirf email (coaching pehle se set).
