/**
 * Board-compliance checks for a school. Pure functions (no database) so they can be self-tested.
 * These are SOFTWARE HELP, not legal advice: every number below is taken from the board's public
 * guidance as understood in Nov 2026 and each check says where it comes from. The school must still
 * follow the board's latest circular; limits can be changed in one place (LIMITS).
 */
export type Board = 'CBSE' | 'CISCE' | 'STATE' | 'OTHER';

export const LIMITS = {
  /** CBSE affiliation bye-laws: 40 students a section is the norm (45 is the outer figure some circulars allow). */
  sectionWarn: 40, sectionHigh: 45,
  /** CBSE affiliation bye-laws: 30 students per teacher, and at least 1.5 teachers per section. */
  pupilTeacher: 30, teachersPerSection: 1.5,
  /** CBSE: 75% attendance to be eligible for the Class X / XII board examination (condonation up to a further 25% needs documented reasons). */
  attendanceMin: 75,
  /** Do not judge attendance before this many marked days — the figure is meaningless early in the session. */
  attendanceMinDays: 20,
} as const;

export function normBoard(text?: string | null): Board {
  const t = String(text || '').toLowerCase();
  if (!t.trim()) return 'OTHER';
  if (/cbse|central board of secondary/.test(t)) return 'CBSE';
  if (/icse|isc\b|cisce|council for the indian school/.test(t)) return 'CISCE';
  if (/state|jac\b|jcert|bseb|bihar|jharkhand|up board|mp board|rbse|maharashtra|wbbse/.test(t)) return 'STATE';
  return 'OTHER';
}

/** "Class 10-A", "X", "9th", "IX", "XII Science" → 10, 10, 9, 9, 12. Nursery / LKG etc. → null. */
export function classNo(name?: string | null): number | null {
  const t = String(name || '').trim().toUpperCase();
  const d = t.match(/(?:^|[^0-9])(1[0-2]|[1-9])(?:ST|ND|RD|TH)?(?:[^0-9]|$)/);
  if (d) return Number(d[1]);
  const romans: Record<string, number> = { XII: 12, XI: 11, X: 10, IX: 9, VIII: 8, VII: 7, VI: 6, V: 5, IV: 4, III: 3, II: 2, I: 1 };
  const r = t.match(/(?:^|[^A-Z])(XII|XI|X|IX|VIII|VII|VI|V|IV|III|II|I)(?:[^A-Z]|$)/);
  return r ? romans[r[1]] : null;
}

export const isApaar = (s?: string | null) => /^\d{12}$/.test(String(s || '').replace(/[\s-]/g, ''));
export const isPen = (s?: string | null) => /^\d{11}$/.test(String(s || '').replace(/[\s-]/g, ''));
/** APAAR / PEN are stored as digits only. */
export const digits = (s?: string | null) => String(s || '').replace(/[\s-]/g, '');
/** Values meaning "the family has been asked and has declined / it is not made yet" — recorded so the school is not nagged forever. */
export const isNoted = (s?: string | null) => /^(refused|declined|not generated|na|n\/a|pending)$/i.test(String(s || '').trim());

/** Clean an APAAR / PEN typed by staff: digits only, or a note word such as "refused". Returns null for blank, throws for anything else. */
export function cleanId(kind: 'APAAR' | 'PEN', v?: string | null): string | null {
  const t = String(v ?? '').trim(); if (!t) return null; if (isNoted(t)) return t.toLowerCase();
  const d = digits(t); const ok = kind === 'APAAR' ? isApaar(d) : isPen(d);
  if (!ok) throw new Error(kind === 'APAAR' ? 'APAAR ID must be 12 digits (or write "refused" / "not generated")' : 'PEN must be 11 digits (or write "refused" / "not generated")');
  return d;
}

export type Lang = 'en' | 'hi' | 'hn';
export type CStudent = { id: string; name: string; className?: string | null; section?: string | null; dob?: string | null; gender?: string | null; fatherName?: string | null; motherName?: string | null; category?: string | null; apaarId?: string | null; pen?: string | null; admissionNo?: string | null; photoConsent?: boolean | null };
export type CSection = { id: string; label: string; className?: string | null; strength: number };
export type CInput = {
  board: Board; profile: { academicSession?: string | null; affiliationNo?: string | null; udiseCode?: string | null; principalName?: string | null; board?: string | null };
  sections: CSection[]; teachers: number; students: CStudent[];
  /** Per student: days marked present (incl. late) and total marked days (leave counted as absent). */
  attendance: Record<string, { present: number; total: number }>;
};
export type Check = { key: string; title: string; status: 'ok' | 'warn' | 'fail' | 'info'; detail: string; source: string; total: number; items: string[] };

const cap = (a: string[], n = 60) => a.slice(0, n);
const label = (s: CStudent) => `${s.name}${s.className ? ` (${s.className}${s.section ? '-' + s.section : ''})` : ''}`;

/** All wording is written in English, Hindi and Hinglish (the screen asks for the language the user chose). */
export function audit(inp: CInput, lang: Lang = 'en'): { board: Board; checks: Check[]; counts: { ok: number; warn: number; fail: number } } {
  const p = (en: string, hi: string, hn: string) => (lang === 'hi' ? hi : lang === 'hn' ? hn : en);
  const checks: Check[] = []; const { board } = inp; const push = (c: Check) => checks.push(c);
  const cbse = board === 'CBSE';

  // 1. school profile
  const missing = [!inp.profile.board && p('Board', 'बोर्ड', 'Board'), !inp.profile.affiliationNo && p('Affiliation number', 'संबद्धता संख्या', 'Affiliation number'), !inp.profile.udiseCode && p('UDISE code', 'UDISE कोड', 'UDISE code'), !inp.profile.principalName && p('Principal name', 'प्रधानाचार्य का नाम', 'Principal ka naam'), !inp.profile.academicSession && p('Academic session', 'शैक्षणिक सत्र', 'Academic session')].filter(Boolean) as string[];
  push({ key: 'profile', title: p('School profile is complete', 'स्कूल प्रोफ़ाइल पूरी है', 'School profile poori hai'), status: missing.length ? 'warn' : 'ok',
    detail: missing.length ? p(`Fill these in School profile — they are printed on certificates and report cards: ${missing.join(', ')}.`, `स्कूल प्रोफ़ाइल में ये भरें — ये प्रमाणपत्र और रिपोर्ट कार्ड पर छपते हैं: ${missing.join(', ')}।`, `School profile mein ye bharein — ye certificate aur report card par chhapte hain: ${missing.join(', ')}.`) : p('Board, affiliation number, UDISE code, principal and session are all filled.', 'बोर्ड, संबद्धता संख्या, UDISE कोड, प्रधानाचार्य और सत्र सब भरे हैं।', 'Board, affiliation number, UDISE code, principal aur session sab bhare hain.'),
    source: p('Printed on every TC and report card', 'हर TC और रिपोर्ट कार्ड पर छपता है', 'Har TC aur report card par chhapta hai'), total: missing.length, items: missing });

  // 2. section size (CBSE only: the numeric norm is from the CBSE affiliation bye-laws)
  if (cbse) {
    const over = inp.sections.filter((s) => s.strength > LIMITS.sectionWarn).sort((a, b) => b.strength - a.strength);
    const high = over.filter((s) => s.strength > LIMITS.sectionHigh); const W = LIMITS.sectionWarn, H = LIMITS.sectionHigh;
    push({ key: 'section-size', title: p(`Students per section (norm ${W})`, `प्रति सेक्शन विद्यार्थी (मानक ${W})`, `Har section mein students (norm ${W})`), status: high.length ? 'fail' : over.length ? 'warn' : 'ok',
      detail: over.length
        ? p(`${over.length} section(s) have more than ${W} students${high.length ? `, ${high.length} of them more than ${H}` : ''}. Split the section or recheck the strength.`, `${over.length} सेक्शन में ${W} से ज़्यादा विद्यार्थी हैं${high.length ? `, इनमें से ${high.length} में ${H} से ज़्यादा` : ''}। सेक्शन बाँटें या संख्या दोबारा जाँचें।`, `${over.length} section mein ${W} se zyada students hain${high.length ? `, inmein se ${high.length} mein ${H} se zyada` : ''}. Section baantein ya sankhya dobara jaanchein.`)
        : p(`No section is above ${W} students.`, `किसी सेक्शन में ${W} से ज़्यादा विद्यार्थी नहीं हैं।`, `Kisi section mein ${W} se zyada students nahi hain.`),
      source: p('CBSE affiliation bye-laws (check the latest circular)', 'CBSE संबद्धता उप-नियम (नवीनतम परिपत्र देखें)', 'CBSE affiliation bye-laws (latest circular dekhein)'), total: over.length,
      items: cap(over.map((s) => p(`${s.label}: ${s.strength} students`, `${s.label}: ${s.strength} विद्यार्थी`, `${s.label}: ${s.strength} students`))) });

    const secs = inp.sections.filter((s) => s.strength > 0).length; const t = inp.teachers; const ratio = t ? inp.students.length / t : Infinity; const probs: string[] = [];
    if (!t) probs.push(p('No teacher is added yet.', 'अभी कोई शिक्षक जोड़ा नहीं गया है।', 'Abhi koi teacher joda nahi gaya hai.'));
    else {
      if (ratio > LIMITS.pupilTeacher) probs.push(p(`${inp.students.length} students for ${t} teachers is ${ratio.toFixed(1)} per teacher (norm ${LIMITS.pupilTeacher}).`, `${t} शिक्षकों पर ${inp.students.length} विद्यार्थी यानी प्रति शिक्षक ${ratio.toFixed(1)} (मानक ${LIMITS.pupilTeacher})।`, `${t} teachers par ${inp.students.length} students yaani har teacher par ${ratio.toFixed(1)} (norm ${LIMITS.pupilTeacher}).`));
      if (secs && t < secs * LIMITS.teachersPerSection) { const need = Math.ceil(secs * LIMITS.teachersPerSection); probs.push(p(`${t} teachers for ${secs} sections; the norm is ${LIMITS.teachersPerSection} teachers per section (${need} needed).`, `${secs} सेक्शन पर ${t} शिक्षक; मानक प्रति सेक्शन ${LIMITS.teachersPerSection} शिक्षक है (${need} चाहिए)।`, `${secs} section par ${t} teachers; norm har section par ${LIMITS.teachersPerSection} teacher hai (${need} chahiye).`)); }
    }
    push({ key: 'teachers', title: p('Teachers for the number of students', 'विद्यार्थियों की संख्या के हिसाब से शिक्षक', 'Students ki sankhya ke hisaab se teachers'), status: probs.length ? 'warn' : 'ok',
      detail: probs.length ? probs.join(' ') : p(`${inp.students.length} students, ${t} teachers (${ratio.toFixed(1)} per teacher), ${secs} sections.`, `${inp.students.length} विद्यार्थी, ${t} शिक्षक (प्रति शिक्षक ${ratio.toFixed(1)}), ${secs} सेक्शन।`, `${inp.students.length} students, ${t} teachers (har teacher par ${ratio.toFixed(1)}), ${secs} section.`),
      source: p('CBSE affiliation bye-laws; counts only teacher logins (Faculty)', 'CBSE संबद्धता उप-नियम; सिर्फ़ शिक्षक लॉगिन (Faculty) गिने गए हैं', 'CBSE affiliation bye-laws; sirf teacher login (Faculty) gine gaye hain'), total: probs.length, items: probs });
  } else {
    push({ key: 'section-size', title: p('Students per section', 'प्रति सेक्शन विद्यार्थी', 'Har section mein students'), status: 'info',
      detail: board === 'CISCE'
        ? p('The CISCE class-size limit is not built in, because we could not confirm an official figure. Set each section’s capacity in Classes & sections.', 'CISCE की कक्षा-सीमा इसमें नहीं है क्योंकि कोई आधिकारिक आँकड़ा पक्का नहीं हो पाया। हर सेक्शन की क्षमता "कक्षाएँ और सेक्शन" में तय करें।', 'CISCE ki class-limit isme nahi hai kyunki koi official figure pakka nahi ho paya. Har section ki capacity "Classes & sections" mein tay karein.')
        : p('Set each section’s capacity in Classes & sections. A board-specific limit is built in for CBSE schools only.', 'हर सेक्शन की क्षमता "कक्षाएँ और सेक्शन" में तय करें। बोर्ड की सीमा सिर्फ़ CBSE स्कूलों के लिए जुड़ी है।', 'Har section ki capacity "Classes & sections" mein tay karein. Board ki limit sirf CBSE schools ke liye judi hai.'),
      source: '—', total: 0, items: [] });
  }

  // 3. attendance
  const A = LIMITS.attendanceMin; const senior = inp.students.filter((s) => { const n = classNo(s.className); return n !== null && n >= 9; });
  const low: string[] = []; let judged = 0;
  for (const s of senior) { const a = inp.attendance[s.id]; if (!a || a.total < LIMITS.attendanceMinDays) continue; judged++; const pct = (a.present / a.total) * 100; if (pct < A) low.push(p(`${label(s)}: ${pct.toFixed(0)}% (${a.present}/${a.total} days)`, `${label(s)}: ${pct.toFixed(0)}% (${a.present}/${a.total} दिन)`, `${label(s)}: ${pct.toFixed(0)}% (${a.present}/${a.total} din)`)); }
  push({ key: 'attendance', title: p(`Attendance below ${A}% in Classes IX–XII`, `कक्षा IX–XII में ${A}% से कम उपस्थिति`, `Class IX–XII mein ${A}% se kam attendance`), status: low.length ? 'warn' : 'ok',
    detail: low.length
      ? p(`${low.length} student(s) are below ${A}%. For the board examination, CBSE expects ${A}% attendance; shortage can be condoned only with documented reasons. Inform the parents in writing now.`, `${low.length} विद्यार्थी ${A}% से नीचे हैं। बोर्ड परीक्षा के लिए CBSE ${A}% उपस्थिति चाहता है; कमी सिर्फ़ लिखित कारणों के साथ माफ़ हो सकती है। अभिभावकों को अभी लिखित में बताएँ।`, `${low.length} student ${A}% se neeche hain. Board exam ke liye CBSE ${A}% attendance chahta hai; kami sirf likhit kaaran ke saath maaf ho sakti hai. Parents ko abhi likhit mein bataiye.`)
      : p(`${judged} senior student(s) with enough marked days; none below ${A}%. Approved leave counts as absent here.`, `${judged} बड़े विद्यार्थियों की काफ़ी दिनों की हाज़िरी लगी है; कोई ${A}% से नीचे नहीं। मंज़ूर छुट्टी यहाँ अनुपस्थिति गिनी गई है।`, `${judged} bade students ki kaafi dinon ki attendance lagi hai; koi ${A}% se neeche nahi. Manzoor chhutti yahan absent gini gayi hai.`),
    source: p('CBSE examination bye-laws (75% rule); other boards have similar rules', 'CBSE परीक्षा उप-नियम (75% नियम); दूसरे बोर्डों के भी ऐसे नियम हैं', 'CBSE exam bye-laws (75% rule); doosre boards ke bhi aise niyam hain'), total: low.length, items: cap(low) });

  // 4. APAAR / PEN formats and readiness for LOC (Classes IX–XII)
  const bad: string[] = [];
  for (const s of inp.students) {
    if (s.apaarId && !isApaar(s.apaarId) && !isNoted(s.apaarId)) bad.push(p(`${label(s)}: APAAR “${s.apaarId}” is not 12 digits`, `${label(s)}: APAAR “${s.apaarId}” 12 अंक का नहीं है`, `${label(s)}: APAAR “${s.apaarId}” 12 digit ka nahi hai`));
    if (s.pen && !isPen(s.pen) && !isNoted(s.pen)) bad.push(p(`${label(s)}: PEN “${s.pen}” is not 11 digits`, `${label(s)}: PEN “${s.pen}” 11 अंक का नहीं है`, `${label(s)}: PEN “${s.pen}” 11 digit ka nahi hai`));
  }
  push({ key: 'id-format', title: p('APAAR ID and PEN written correctly', 'APAAR आईडी और PEN सही लिखे हैं', 'APAAR ID aur PEN sahi likhe hain'), status: bad.length ? 'fail' : 'ok',
    detail: bad.length ? p('Correct these before sending data to the board; a wrong digit makes the match fail.', 'बोर्ड को डेटा भेजने से पहले इन्हें सुधारें; एक अंक गलत होने पर मिलान नहीं होता।', 'Board ko data bhejne se pehle inhein theek karein; ek digit galat hone par match nahi hota.') : p('Every APAAR ID / PEN that is filled looks correctly formatted (APAAR = 12 digits, PEN = 11 digits).', 'जो भी APAAR आईडी / PEN भरे हैं वे सही रूप में हैं (APAAR = 12 अंक, PEN = 11 अंक)।', 'Jo bhi APAAR ID / PEN bhare hain wo sahi roop mein hain (APAAR = 12 digit, PEN = 11 digit).'),
    source: p('APAAR (One Nation One Student ID) and PEN formats', 'APAAR (एक राष्ट्र एक विद्यार्थी आईडी) और PEN का प्रारूप', 'APAAR (One Nation One Student ID) aur PEN ka format'), total: bad.length, items: cap(bad) });

  const notReady: string[] = [];
  for (const s of senior) {
    const m = [!s.dob && p('date of birth', 'जन्म तिथि', 'janm tithi'), !s.fatherName && p('father’s name', 'पिता का नाम', 'pita ka naam'), !s.motherName && p('mother’s name', 'माता का नाम', 'mata ka naam'), !s.gender && p('gender', 'लिंग', 'gender'), !s.category && p('category', 'श्रेणी', 'category'), !(isApaar(s.apaarId) || isNoted(s.apaarId)) && 'APAAR ID'].filter(Boolean);
    if (m.length) notReady.push(`${label(s)}: ${m.join(', ')}`);
  }
  push({ key: 'loc', title: p('List of Candidates (LOC) readiness, Classes IX–XII', 'उम्मीदवारों की सूची (LOC) की तैयारी, कक्षा IX–XII', 'Candidates ki list (LOC) ki taiyaari, Class IX–XII'), status: notReady.length ? 'warn' : 'ok',
    detail: notReady.length
      ? p(`${notReady.length} of ${senior.length} senior students have details missing that the board asks for when registering / listing candidates. Write “refused” or “not generated” in APAAR if the family has declined or it is not made yet, so it stops showing here.`, `${senior.length} में से ${notReady.length} बड़े विद्यार्थियों की वे जानकारियाँ अधूरी हैं जो बोर्ड पंजीकरण / सूची के लिए माँगता है। अगर परिवार ने मना किया है या APAAR बना नहीं है तो APAAR में “refused” या “not generated” लिखें, फिर यह यहाँ नहीं दिखेगा।`, `${senior.length} mein se ${notReady.length} bade students ki wo jaankari adhoori hai jo board registration / list ke liye maangta hai. Agar parivar ne mana kiya hai ya APAAR bana nahi hai to APAAR mein “refused” ya “not generated” likhein, phir ye yahan nahi dikhega.`)
      : p(`All ${senior.length} senior students have the details the board asks for.`, `सभी ${senior.length} बड़े विद्यार्थियों की वह जानकारी पूरी है जो बोर्ड माँगता है।`, `Sabhi ${senior.length} bade students ki wo jaankari poori hai jo board maangta hai.`),
    source: p('CBSE registration / LOC data (name, parents, date of birth, APAAR); check the board’s current notice', 'CBSE पंजीकरण / LOC डेटा (नाम, माता-पिता, जन्म तिथि, APAAR); बोर्ड की मौजूदा सूचना देखें', 'CBSE registration / LOC data (naam, mata-pita, janm tithi, APAAR); board ki maujooda notice dekhein'), total: notReady.length, items: cap(notReady) });

  const noApaar = inp.students.filter((s) => !s.apaarId).length;
  push({ key: 'apaar-all', title: p('APAAR ID collected', 'APAAR आईडी ली गई', 'APAAR ID li gayi'), status: noApaar ? 'info' : 'ok',
    detail: noApaar ? p(`${noApaar} of ${inp.students.length} students have no APAAR ID yet. It is created with the parent’s consent; it cannot be forced.`, `${inp.students.length} में से ${noApaar} विद्यार्थियों की APAAR आईडी अभी नहीं है। यह अभिभावक की सहमति से बनती है; इसके लिए ज़बरदस्ती नहीं की जा सकती।`, `${inp.students.length} mein se ${noApaar} students ki APAAR ID abhi nahi hai. Ye parent ki sahmati se banti hai; iske liye zabardasti nahi ho sakti.`) : p('Every student has an APAAR ID or a note.', 'हर विद्यार्थी की APAAR आईडी या टिप्पणी दर्ज है।', 'Har student ki APAAR ID ya note darj hai.'),
    source: p('Ministry of Education APAAR guidance (consent-based)', 'शिक्षा मंत्रालय का APAAR मार्गदर्शन (सहमति आधारित)', 'Shiksha Mantralaya ka APAAR guidance (sahmati par aadharit)'), total: noApaar, items: [] });

  // 5. photo consent (DPDP): the software cannot know who is in a photo, so it lists the families who said NO — staff check this list before posting any photo
  const no = inp.students.filter((s) => s.photoConsent === false); const unknown = inp.students.filter((s) => s.photoConsent == null).length;
  push({ key: 'photo-consent', title: p('Photo consent of families', 'परिवारों की फ़ोटो सहमति', 'Parivaron ki photo sahmati'), status: no.length ? 'warn' : 'ok',
    detail: no.length
      ? p(`${no.length} student(s) have NOT allowed their photo to be shown (events, notices, website). Check this list before you post any photo. Student ID photos are kept private to staff. ${unknown} more have no answer recorded (older admissions) — treat them as “no” for publicity.`, `${no.length} विद्यार्थियों के परिवार ने फ़ोटो दिखाने की (कार्यक्रम, सूचना, वेबसाइट) अनुमति नहीं दी है। कोई भी फ़ोटो डालने से पहले यह सूची देखें। विद्यार्थियों की ID फ़ोटो सिर्फ़ स्टाफ़ को दिखती है। ${unknown} और का जवाब दर्ज नहीं है (पुराने दाख़िले) — प्रचार के लिए इन्हें “नहीं” मानें।`, `${no.length} students ke parivar ne photo dikhane (events, notices, website) ki anumati nahi di hai. Koi bhi photo daalne se pehle ye list dekhein. Students ki ID photo sirf staff ko dikhti hai. ${unknown} aur ka jawab darj nahi hai (purane admission) — publicity ke liye inhein “nahi” maanein.`)
      : p(`Nobody has refused. ${unknown} student(s) have no answer recorded (older admissions) — treat them as “no” for publicity until you ask. Student ID photos are kept private to staff.`, `किसी ने मना नहीं किया। ${unknown} विद्यार्थियों का जवाब दर्ज नहीं है (पुराने दाख़िले) — पूछे बिना प्रचार के लिए इन्हें “नहीं” मानें। विद्यार्थियों की ID फ़ोटो सिर्फ़ स्टाफ़ को दिखती है।`, `Kisi ne mana nahi kiya. ${unknown} students ka jawab darj nahi hai (purane admission) — poochhe bina publicity ke liye inhein “nahi” maanein. Students ki ID photo sirf staff ko dikhti hai.`),
    source: p('Digital Personal Data Protection Act 2023 (children’s data needs the parent’s consent)', 'डिजिटल व्यक्तिगत डेटा संरक्षण अधिनियम 2023 (बच्चों के डेटा के लिए अभिभावक की सहमति ज़रूरी)', 'Digital Personal Data Protection Act 2023 (bachchon ke data ke liye parent ki sahmati zaroori)'), total: no.length, items: cap(no.map(label)) });

  const counts = { ok: checks.filter((c) => c.status === 'ok').length, warn: checks.filter((c) => c.status === 'warn').length, fail: checks.filter((c) => c.status === 'fail').length };
  return { board, checks, counts };
}

/** Number of words for a date, as the TC asks "date of birth in words". 2012-03-05 → "Fifth March Two Thousand Twelve". */
export function dateInWords(iso?: string | null): string {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); if (!m) return '';
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const below100 = (n: number) => (n < 20 ? ones[n] : tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : ''));
  const ord = ['', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth', 'Eleventh', 'Twelfth', 'Thirteenth', 'Fourteenth', 'Fifteenth', 'Sixteenth', 'Seventeenth', 'Eighteenth', 'Nineteenth', 'Twentieth', 'Twenty First', 'Twenty Second', 'Twenty Third', 'Twenty Fourth', 'Twenty Fifth', 'Twenty Sixth', 'Twenty Seventh', 'Twenty Eighth', 'Twenty Ninth', 'Thirtieth', 'Thirty First'];
  const months = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const y = Number(m[1]); const mo = Number(m[2]); const d = Number(m[3]); if (!ord[d] || !months[mo]) return '';
  const th = Math.floor(y / 1000); const rest = y % 1000; const h = Math.floor(rest / 100); const r = rest % 100;
  const year = [th ? `${ones[th]} Thousand` : '', h ? `${ones[h]} Hundred` : '', r ? (h || th ? 'and ' : '') + below100(r) : ''].filter(Boolean).join(' ');
  return `${ord[d]} ${months[mo]} ${year}`;
}
