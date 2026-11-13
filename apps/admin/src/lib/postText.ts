/** Text side of the social-media post maker: occasions, wishes in three languages, captions, hashtags and line fitting. Pure (no canvas, no DOM), so it can be self-tested. */
export type Lang = 'en' | 'hi' | 'hn';
export type Occasion = { key: string; emoji: string; colours: [string, string, string]; tag: string; title: Record<Lang, string>; body: Record<Lang, string> };

/** {centre} is replaced by the school / coaching name. colours = [main, second, accent]. */
export const OCCASIONS: Occasion[] = [
  { key: 'diwali', emoji: '🪔', colours: ['#B71C1C', '#E65100', '#FFC107'], tag: 'HappyDiwali', title: { en: 'Happy Diwali', hi: 'दीपावली की शुभकामनाएँ', hn: 'Happy Diwali' }, body: { en: 'May this festival of lights fill your home with joy and your future with success. Warm wishes from {centre}.', hi: 'दीपों का यह त्योहार आपके घर में ख़ुशियाँ और आपके भविष्य में सफलता लाए। {centre} परिवार की ओर से हार्दिक शुभकामनाएँ।', hn: 'Deepon ka yeh tyohaar aapke ghar mein khushiyan aur aapke bhavishya mein safalta laaye. {centre} parivar ki taraf se dher saari shubhkamnayein.' } },
  { key: 'holi', emoji: '🎨', colours: ['#AD1457', '#6A1B9A', '#FFB300'], tag: 'HappyHoli', title: { en: 'Happy Holi', hi: 'होली की शुभकामनाएँ', hn: 'Happy Holi' }, body: { en: 'May the colours of Holi bring happiness, health and togetherness to you and your family. — {centre}', hi: 'होली के रंग आपके और आपके परिवार के जीवन में ख़ुशी, सेहत और अपनापन लाएँ। — {centre}', hn: 'Holi ke rang aapke aur aapke parivar ke jeevan mein khushi, sehat aur apnapan laayein. — {centre}' } },
  { key: 'eid', emoji: '🌙', colours: ['#00695C', '#004D40', '#FFD54F'], tag: 'EidMubarak', title: { en: 'Eid Mubarak', hi: 'ईद मुबारक', hn: 'Eid Mubarak' }, body: { en: 'May this Eid bring peace, happiness and blessings to you and your family. — {centre}', hi: 'यह ईद आपके और आपके परिवार के लिए अमन, ख़ुशी और बरकत लेकर आए। — {centre}', hn: 'Yeh Eid aapke aur aapke parivar ke liye aman, khushi aur barkat lekar aaye. — {centre}' } },
  { key: 'christmas', emoji: '🎄', colours: ['#B71C1C', '#1B5E20', '#FFD54F'], tag: 'MerryChristmas', title: { en: 'Merry Christmas', hi: 'क्रिसमस की शुभकामनाएँ', hn: 'Merry Christmas' }, body: { en: 'Wishing you joy, love and peace this Christmas. Season’s greetings from all of us at {centre}.', hi: 'इस क्रिसमस आपके जीवन में ख़ुशी, प्यार और शांति बनी रहे। {centre} की ओर से शुभकामनाएँ।', hn: 'Is Christmas aapke jeevan mein khushi, pyaar aur shanti bani rahe. {centre} ki taraf se shubhkamnayein.' } },
  { key: 'newyear', emoji: '🎉', colours: ['#0D1B4C', '#283593', '#FFC107'], tag: 'HappyNewYear', title: { en: 'Happy New Year', hi: 'नववर्ष की शुभकामनाएँ', hn: 'Happy New Year' }, body: { en: 'A new year, new goals. Let us make it a year of learning and growth. — {centre}', hi: 'नया साल, नए लक्ष्य। आइए इसे सीखने और आगे बढ़ने का साल बनाएँ। — {centre}', hn: 'Naya saal, naye lakshya. Aaiye ise seekhne aur aage badhne ka saal banayein. — {centre}' } },
  { key: 'independence', emoji: '🇮🇳', colours: ['#E65100', '#1B5E20', '#1A237E'], tag: 'IndependenceDay', title: { en: 'Happy Independence Day', hi: 'स्वतंत्रता दिवस की शुभकामनाएँ', hn: 'Happy Independence Day' }, body: { en: 'Jai Hind! Proud of every student working hard for a brighter India. — {centre}', hi: 'जय हिंद! उज्ज्वल भारत के लिए मेहनत करने वाले हर विद्यार्थी पर हमें गर्व है। — {centre}', hn: 'Jai Hind! Ujjwal Bharat ke liye mehnat karne wale har student par humein garv hai. — {centre}' } },
  { key: 'republic', emoji: '🇮🇳', colours: ['#E65100', '#1B5E20', '#1A237E'], tag: 'RepublicDay', title: { en: 'Happy Republic Day', hi: 'गणतंत्र दिवस की शुभकामनाएँ', hn: 'Happy Republic Day' }, body: { en: 'Let us honour our Constitution and build a stronger India together. — {centre}', hi: 'आइए संविधान का सम्मान करें और मिलकर मज़बूत भारत बनाएँ। — {centre}', hn: 'Aaiye Samvidhan ka samman karein aur milkar mazboot Bharat banayein. — {centre}' } },
  { key: 'teachers', emoji: '📚', colours: ['#1565C0', '#0D47A1', '#FFC107'], tag: 'TeachersDay', title: { en: 'Happy Teachers’ Day', hi: 'शिक्षक दिवस की शुभकामनाएँ', hn: 'Happy Teachers’ Day' }, body: { en: 'To the teachers who light the way for every child: thank you for everything you do. — {centre}', hi: 'हर बच्चे की राह रोशन करने वाले शिक्षकों को हमारा हृदय से धन्यवाद। — {centre}', hn: 'Har bachche ki raah roshan karne wale teachers ko humara dil se dhanyawaad. — {centre}' } },
  { key: 'childrens', emoji: '🎈', colours: ['#0288D1', '#7B1FA2', '#FFEB3B'], tag: 'ChildrensDay', title: { en: 'Happy Children’s Day', hi: 'बाल दिवस की शुभकामनाएँ', hn: 'Happy Children’s Day' }, body: { en: 'Every child is a star. Keep dreaming, keep learning, keep smiling! — {centre}', hi: 'हर बच्चा एक सितारा है। सपने देखते रहो, सीखते रहो, मुस्कुराते रहो! — {centre}', hn: 'Har bachcha ek sitara hai. Sapne dekhte raho, seekhte raho, muskurate raho! — {centre}' } },
  { key: 'dussehra', emoji: '🏹', colours: ['#BF360C', '#6D4C41', '#FFCA28'], tag: 'HappyDussehra', title: { en: 'Happy Dussehra', hi: 'विजयादशमी की शुभकामनाएँ', hn: 'Happy Dussehra' }, body: { en: 'May good always win over evil. Wishing you victory in everything you do. — {centre}', hi: 'सत्य की सदा असत्य पर जीत हो। आपको हर काम में विजय मिले। — {centre}', hn: 'Satya ki sada asatya par jeet ho. Aapko har kaam mein vijay mile. — {centre}' } },
  { key: 'rakhi', emoji: '🧵', colours: ['#C2185B', '#E64A19', '#FFE082'], tag: 'RakshaBandhan', title: { en: 'Happy Raksha Bandhan', hi: 'रक्षाबंधन की शुभकामनाएँ', hn: 'Happy Raksha Bandhan' }, body: { en: 'Celebrating the bond of love between brothers and sisters. — {centre}', hi: 'भाई-बहन के प्यार के इस पावन बंधन की हार्दिक शुभकामनाएँ। — {centre}', hn: 'Bhai-behen ke pyaar ke is paawan bandhan ki hardik shubhkamnayein. — {centre}' } },
  { key: 'sankranti', emoji: '🪁', colours: ['#F57F17', '#E65100', '#FFFFFF'], tag: 'MakarSankranti', title: { en: 'Happy Makar Sankranti', hi: 'मकर संक्रांति की शुभकामनाएँ', hn: 'Happy Makar Sankranti' }, body: { en: 'May your dreams fly as high as a kite. Warm wishes on Makar Sankranti. — {centre}', hi: 'आपके सपने पतंग की तरह ऊँचे उड़ें। मकर संक्रांति की हार्दिक शुभकामनाएँ। — {centre}', hn: 'Aapke sapne patang ki tarah ooncha udein. Makar Sankranti ki hardik shubhkamnayein. — {centre}' } },
  { key: 'gandhi', emoji: '🕊️', colours: ['#37474F', '#546E7A', '#FFC107'], tag: 'GandhiJayanti', title: { en: 'Gandhi Jayanti', hi: 'गांधी जयंती', hn: 'Gandhi Jayanti' }, body: { en: 'Truth, non-violence and simplicity: lessons that guide us every day. — {centre}', hi: 'सत्य, अहिंसा और सादगी: ऐसी सीख जो हमें हर दिन राह दिखाती है। — {centre}', hn: 'Satya, ahimsa aur saadgi: aisi seekh jo humein har din raah dikhati hai. — {centre}' } },
  { key: 'exam', emoji: '✨', colours: ['#00838F', '#006064', '#FFD54F'], tag: 'AllTheBest', title: { en: 'All the Best!', hi: 'परीक्षा की शुभकामनाएँ!', hn: 'All the Best!' }, body: { en: 'Stay calm, trust your preparation and give it your best. We believe in you. — {centre}', hi: 'शांत रहें, अपनी तैयारी पर भरोसा रखें और अपना सर्वश्रेष्ठ दें। हमें आप पर विश्वास है। — {centre}', hn: 'Shaant rahein, apni taiyaari par bharosa rakhein aur apna best dein. Humein aap par vishwas hai. — {centre}' } },
  { key: 'result', emoji: '🎓', colours: ['#4A148C', '#6A1B9A', '#FFD54F'], tag: 'Congratulations', title: { en: 'Congratulations!', hi: 'बहुत-बहुत बधाई!', hn: 'Congratulations!' }, body: { en: 'Proud of every student and every effort. Keep going, keep growing! — {centre}', hi: 'हर विद्यार्थी और हर मेहनत पर हमें गर्व है। आगे बढ़ते रहिए! — {centre}', hn: 'Har student aur har mehnat par humein garv hai. Aage badhte rahiye! — {centre}' } },
  { key: 'admission', emoji: '🏫', colours: ['#1565C0', '#00838F', '#FFC107'], tag: 'AdmissionsOpen', title: { en: 'Admissions Open', hi: 'दाख़िले जारी हैं', hn: 'Admissions Open' }, body: { en: 'Admissions are open at {centre}. Call or visit us to know more and secure a seat for your child.', hi: '{centre} में दाख़िले शुरू हैं। अधिक जानकारी के लिए फ़ोन करें या स्कूल आएँ और अपने बच्चे की सीट पक्की करें।', hn: '{centre} mein admission shuru hain. Adhik jaankari ke liye phone karein ya school aayein aur apne bachche ki seat pakki karein.' } },
  { key: 'annualday', emoji: '🏆', colours: ['#880E4F', '#4A148C', '#FFD54F'], tag: 'AnnualDay', title: { en: 'Annual Day', hi: 'वार्षिकोत्सव', hn: 'Annual Day' }, body: { en: 'You are warmly invited to our Annual Day celebration. Come and cheer for our students. — {centre}', hi: 'हमारे वार्षिकोत्सव में आपका हार्दिक स्वागत है। आइए और हमारे विद्यार्थियों का उत्साह बढ़ाइए। — {centre}', hn: 'Humare Annual Day mein aapka hardik swagat hai. Aaiye aur humare students ka utsaah badhaiye. — {centre}' } },
  { key: 'custom', emoji: '⭐', colours: ['#0F766E', '#134E4A', '#FBBF24'], tag: 'ThankYou', title: { en: 'Your message', hi: 'आपका संदेश', hn: 'Aapka sandesh' }, body: { en: 'Write your message here. — {centre}', hi: 'अपना संदेश यहाँ लिखें। — {centre}', hn: 'Apna sandesh yahan likhein. — {centre}' } },
];

export const fill = (s: string, centre: string) => s.replace(/\{centre\}/g, centre || 'our school');
export const initials = (name: string) => (String(name || '').match(/[A-Za-z0-9ऀ-ॿ]+/g) || []).filter((w) => !/^(the|of|and|school|public|coaching|classes|institute|centre|center)$/i.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || (String(name || 'N')[0] || 'N').toUpperCase();
const camel = (s: string) => (String(s || '').match(/[A-Za-z0-9]+/g) || []).map((w) => w[0].toUpperCase() + w.slice(1)).join('');

/** Hashtags for the caption: the occasion, the school, the city. No spaces, no punctuation, never more than 8. */
export function hashtags(occasion: Occasion, centre: string, city?: string): string[] {
  const tags = [occasion.tag, occasion.key === 'custom' ? '' : 'Wishes', camel(centre), camel(city || ''), 'School', 'Students', 'Education'].filter(Boolean);
  return [...new Set(tags)].slice(0, 8).map((t) => '#' + t);
}

/** The text that goes under the picture on Facebook / Instagram / WhatsApp. */
export function caption(o: { title: string; body: string; centre: string; phone?: string; website?: string; address?: string; city?: string; occasion: Occasion }): string {
  const lines = [`${o.occasion.emoji} ${o.title}`, '', o.body, ''];
  const contact = [o.phone && `📞 ${o.phone}`, o.website && `🌐 ${o.website}`, o.address && `📍 ${o.address}`].filter(Boolean); if (contact.length) lines.push(contact.join('\n'), '');
  lines.push(hashtags(o.occasion, o.centre, o.city).join(' ')); return lines.join('\n').trim();
}

/** Break text into lines no wider than maxWidth (greedy by words; a single very long word is split). measure(s) returns the width of s in pixels. */
export function wrapLines(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const out: string[] = [];
  for (const para of String(text || '').split(/\r?\n/)) {
    const words = para.split(/\s+/).filter(Boolean); if (!words.length) { out.push(''); continue; } let line = '';
    for (let w of words) {
      while (measure(w) > maxWidth && w.length > 1) { let k = w.length - 1; while (k > 1 && measure(w.slice(0, k)) > maxWidth) k--; if (line) { out.push(line); line = ''; } out.push(w.slice(0, k)); w = w.slice(k); }
      const test = line ? line + ' ' + w : w; if (measure(test) <= maxWidth || !line) line = test; else { out.push(line); line = w; }
    }
    if (line) out.push(line);
  }
  return out;
}

/** Biggest font size (from start down to min) at which the text fits in maxLines lines. measureAt(size, s) is the width of s at that size. */
export function fitFont(text: string, maxWidth: number, maxLines: number, start: number, min: number, measureAt: (size: number, s: string) => number): { size: number; lines: string[]; fits: boolean } {
  for (let size = start; size >= min; size -= 2) { const lines = wrapLines(text, maxWidth, (s) => measureAt(size, s)); if (lines.length <= maxLines) return { size, lines, fits: true }; }
  const lines = wrapLines(text, maxWidth, (s) => measureAt(min, s)); return { size: min, lines: lines.slice(0, maxLines).map((l, i, a) => (i === a.length - 1 && lines.length > maxLines ? l.replace(/\s*\S*$/, '') + '…' : l)), fits: false };
}

export const FORMATS: { key: string; label: string; w: number; h: number; note: string }[] = [
  { key: 'square', label: 'Square 1080 × 1080', w: 1080, h: 1080, note: 'Instagram and Facebook post' },
  { key: 'portrait', label: 'Portrait 1080 × 1350', w: 1080, h: 1350, note: 'Instagram feed (takes more space)' },
  { key: 'story', label: 'Story 1080 × 1920', w: 1080, h: 1920, note: 'WhatsApp status, Instagram / Facebook story' },
  { key: 'wide', label: 'Wide 1200 × 630', w: 1200, h: 630, note: 'Facebook link post, X (Twitter)' },
];
