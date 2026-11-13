/** Students, classes, enquiries, staff, import, ID cards, certificates. English | Hindi | Hinglish */
export const PEOPLE = `
+ Add student | + विद्यार्थी जोड़ें | + Student jodein
Add student | विद्यार्थी जोड़ें | Student jodein
Import from Excel | Excel से जोड़ें | Excel se jodein
Import from Excel / CSV | Excel / CSV से जोड़ें | Excel / CSV se jodein
Export | सूची डाउनलोड करें | List download karein
Search name, roll, admission no, parent, mobile | नाम, रोल नंबर, प्रवेश नंबर, अभिभावक या मोबाइल से खोजें | Naam, roll no, admission no, parent ya mobile se khojein
All batches | सभी बैच | Sabhi batches
Any gender | कोई भी लिंग | Koi bhi gender
Left / inactive | छोड़ चुके / बंद | Chhod chuke / inactive
{n} active | {n} चालू | {n} active
{n} shown | {n} दिख रहे हैं | {n} dikh rahe hain
Adm. no | प्रवेश नं. | Adm. no
Roll | रोल | Roll
Student | विद्यार्थी | Student
Parent | अभिभावक | Parent
Profile | प्रोफ़ाइल | Profile
Move | दूसरी कक्षा में भेजें | Doosri class mein bhejein
Move to… | इसमें भेजें… | Isme bhejein…
Clear | साफ़ करें | Saaf karein
Page | पन्ना | Page
Next → | आगे → | Aage →
← Prev | ← पीछे | ← Peeche
Not assigned | कक्षा तय नहीं | Class tay nahi
Student name | विद्यार्थी का नाम | Student ka naam
Student name * | विद्यार्थी का नाम * | Student ka naam *
Roll no (auto if blank) | रोल नंबर (ख़ाली छोड़ें तो अपने आप) | Roll no (khaali chhodein to apne aap)
Date of birth | जन्म तिथि | Date of birth
Gender | लिंग | Gender
Male | पुरुष / लड़का | Male
Female | महिला / लड़की | Female
Other | अन्य | Other
Blood group | रक्त समूह | Blood group
Father’s name | पिता का नाम | Father ka naam
Mother’s name | माता का नाम | Mother ka naam
Father | पिता | Father
Mother | माता | Mother
Parent mobile * (login) | अभिभावक का मोबाइल * (लॉगिन के लिए) | Parent ka mobile * (login ke liye)
Parent email * (login) | अभिभावक का ईमेल * (लॉगिन के लिए) | Parent ka email * (login ke liye)
Student mobile (own login) | विद्यार्थी का मोबाइल (उसके अपने लॉगिन के लिए) | Student ka mobile (uske apne login ke liye)
Student email (own login) | विद्यार्थी का ईमेल (उसके अपने लॉगिन के लिए) | Student ka email (uske apne login ke liye)
The parent logs in with the email above. Class, roll number and admission number are filled automatically when left blank. | अभिभावक ऊपर दिए ईमेल से लॉगिन करते हैं। कक्षा, रोल नंबर और प्रवेश नंबर ख़ाली छोड़ने पर अपने आप भर जाते हैं। | Parent upar diye email se login karte hain. Class, roll number aur admission number khaali chhodne par apne aap bhar jaate hain.
Columns (any order): Name, Roll No, Class, Father, Mother, Parent Mobile, Email, Gender, DOB, Address, Category, Religion, Blood Group, Admission No. Extra columns are ignored. | कॉलम किसी भी क्रम में हो सकते हैं: नाम, रोल नंबर, कक्षा, पिता, माता, अभिभावक का मोबाइल, ईमेल, लिंग, जन्म तिथि, पता, श्रेणी, धर्म, रक्त समूह, प्रवेश नंबर। बाक़ी कॉलम छोड़ दिए जाते हैं। | Columns kisi bhi order mein ho sakte hain: Name, Roll No, Class, Father, Mother, Parent Mobile, Email, Gender, DOB, Address, Category, Religion, Blood Group, Admission No. Baaki columns chhod diye jaate hain.
rows read · | पंक्तियाँ पढ़ी गईं · | rows padhi gayi ·
have problems (shown in red) and will be skipped | में गड़बड़ी है (लाल रंग में दिख रही है), इन्हें छोड़ दिया जाएगा | mein gadbadi hai (laal rang mein dikh rahi hai), inhein chhod diya jayega

Batch name | बैच का नाम | Batch ka naam
Course | कोर्स | Course
Capacity | कितनी सीटें | Capacity
Add batch | बैच जोड़ें | Batch jodein
Class teacher | कक्षा अध्यापक | Class teacher
Teachers | शिक्षक | Teachers
+ assign teacher | + शिक्षक तय करें | + teacher tay karein
Promote | अगली कक्षा में भेजें | Agli class mein bhejein
Promote to | इस कक्षा में भेजें | Is class mein bhejein
Promote — | अगली कक्षा में भेजें — | Agli class mein bhejein —
Tick students to | विद्यार्थियों को चुनें: | Students ko chunein:
over capacity | सीटों से ज़्यादा | seats se zyada
No batches yet — add the first one above, then add students to it. | अभी कोई बैच नहीं है। ऊपर से पहला बैच जोड़ें, फिर उसमें विद्यार्थी जोड़ें। | Abhi koi batch nahi hai. Upar se pehla batch jodein, phir usmein students jodein.
Create classes & sections in one go | एक बार में कक्षाएँ और सेक्शन बनाएँ | Ek baar mein classes aur sections banayein
Classes (comma separated) | कक्षाएँ (कॉमा से अलग करें) | Classes (comma se alag karein)
Sections | सेक्शन | Sections
Prefix | नाम की शुरुआत | Prefix
Seats per section | हर सेक्शन में सीटें | Har section mein seats
Create | बनाएँ | Banayein
Example: classes 1,2,3 and sections A,B,C,D create “Class 1 - A” … “Class 3 - D”. Existing ones are skipped. Use “Nursery, LKG, UKG” for pre-primary. | उदाहरण: कक्षा 1,2,3 और सेक्शन A,B,C,D लिखने पर “Class 1 - A” से “Class 3 - D” तक बन जाएँगी। जो पहले से हैं उन्हें छोड़ दिया जाएगा। प्री-प्राइमरी के लिए “Nursery, LKG, UKG” लिखें। | Example: classes 1,2,3 aur sections A,B,C,D likhne par “Class 1 - A” se “Class 3 - D” tak ban jayengi. Jo pehle se hain unhein chhod diya jayega. Pre-primary ke liye “Nursery, LKG, UKG” likhein.
Class name on each student updates automatically. Fee plans and history are kept. | हर विद्यार्थी की कक्षा का नाम अपने आप बदल जाता है। फ़ीस की योजना और पुराना रिकॉर्ड वैसा ही रहता है। | Har student ki class ka naam apne aap badal jata hai. Fee plan aur purana record waisa hi rehta hai.

Enquiries | पूछताछ | Enquiries
New | नई | Naya
Contacted | बात हो गई | Baat ho gayi
Demo | डेमो | Demo
Admitted | प्रवेश हो गया | Admit ho gaya
Lost | छूट गया | Chhoot gaya
Student name | विद्यार्थी का नाम | Student ka naam
Course | कोर्स | Course
Source | कहाँ से पता चला | Kahan se pata chala
Follow up on | दोबारा बात करने की तारीख़ | Dobara baat karne ki date
Walk-in | सीधे आए | Walk-in
Admit | प्रवेश दें | Admit karein
Batch to admit into | किस बैच में प्रवेश दें | Kis batch mein admit karein
No batch yet | अभी कोई बैच नहीं | Abhi koi batch nahi
No enquiries | कोई पूछताछ नहीं | Koi enquiry nahi
Conversion | कितनों ने प्रवेश लिया | Kitno ne admission liya

Add many students, teachers, enquiries, books or stock items at once from an Excel, CSV, Word or PDF file — or a photo of a register. | Excel, CSV, Word या PDF फ़ाइल से, या रजिस्टर की फ़ोटो से, एक साथ बहुत से विद्यार्थी, शिक्षक, पूछताछ, किताबें या सामान जोड़ें। | Excel, CSV, Word ya PDF file se, ya register ki photo se, ek saath bahut se students, teachers, enquiries, books ya saaman jodein.
1. What are you importing? | 1. आप क्या जोड़ना चाहते हैं? | 1. Aap kya jodna chahte hain?
2. Choose the file | 2. फ़ाइल चुनें | 2. File chunein
Choose file | फ़ाइल चुनें | File chunein
Change file | फ़ाइल बदलें | File badlein
Read the file | फ़ाइल पढ़ें | File padhein
Reading the file… | फ़ाइल पढ़ रहे हैं… | File padh rahe hain…
Teachers & staff | शिक्षक और स्टाफ़ | Teachers aur staff
Library books | पुस्तकालय की किताबें | Library ki books
Inventory items | सामान की सूची | Saaman ki list
Class for students whose class is not in the file | जिन विद्यार्थियों की कक्षा फ़ाइल में नहीं है, उनके लिए कक्षा | Jin students ki class file mein nahi hai, unke liye class
— take it from the file — | — फ़ाइल से ही लें — | — file se hi lein —
3. Check and fix | 3. जाँचें और सुधारें | 3. Check karein aur sudharein
Import finished | जोड़ने का काम पूरा हुआ | Import poora hua
Import another file | दूसरी फ़ाइल जोड़ें | Doosri file import karein
added | जुड़े | jude
skipped | छोड़े गए | chhode gaye
errors | गड़बड़ी वाले | gadbadi wale
Tip: the first row of the file should have column names such as | सुझाव: फ़ाइल की पहली पंक्ति में कॉलम के नाम होने चाहिए, जैसे | Tip: file ki pehli row mein column ke naam hone chahiye, jaise
Name, Class, Roll No, Mobile | नाम, कक्षा, रोल नंबर, मोबाइल | Name, Class, Roll No, Mobile
. Mobile numbers are needed for students (parents log in with them). | । विद्यार्थियों के लिए मोबाइल नंबर ज़रूरी हैं (अभिभावक उसी से लॉगिन करते हैं)। | . Students ke liye mobile number zaroori hain (parents usi se login karte hain).
{n} ready | {n} तैयार | {n} ready
{n} already exist | {n} पहले से मौजूद | {n} pehle se maujood
{n} need fixing | {n} में सुधार चाहिए | {n} mein sudhar chahiye
Rows marked "already exist" or "need fixing" are not imported. | जिन पंक्तियों पर “पहले से मौजूद” या “सुधार चाहिए” लिखा है, वे नहीं जोड़ी जाएँगी। | Jin rows par “already exist” ya “need fixing” likha hai, woh import nahi hongi.

Staff & privileges | स्टाफ़ और उनके अधिकार | Staff aur unke access
Add staff | स्टाफ़ जोड़ें | Staff jodein
Teacher preset | शिक्षक के लिए तय अधिकार | Teacher ke liye tay access
Front-desk preset | रिसेप्शन के लिए तय अधिकार | Reception ke liye tay access
Accountant preset | हिसाब-किताब वाले के लिए तय अधिकार | Accountant ke liye tay access
Physics faculty / Receptionist | जैसे: भौतिकी शिक्षक / रिसेप्शनिस्ट | jaise: Physics teacher / Receptionist

Print class ID cards (PDF) | पूरी कक्षा के पहचान पत्र छापें (PDF) | Poori class ke ID card print karein (PDF)
Add many photos at once | एक साथ कई फ़ोटो जोड़ें | Ek saath kai photos jodein
Card | पहचान पत्र | Card

Student | विद्यार्थी | Student
Certificate | प्रमाण पत्र | Certificate
Purpose | किस काम के लिए | Kis kaam ke liye
Remarks | टिप्पणी | Remarks
Issue & open PDF | जारी करें और PDF खोलें | Issue karein aur PDF kholein
Transfer Certificate (TC) | स्थानांतरण प्रमाण पत्र (TC) | Transfer Certificate (TC)
Bonafide Certificate | चरित्र एवं अध्ययन प्रमाण पत्र (बोनाफ़ाइड) | Bonafide Certificate
Character Certificate | चरित्र प्रमाण पत्र | Character Certificate
Study Certificate | अध्ययन प्रमाण पत्र | Study Certificate
Fee Paid Certificate | फ़ीस जमा प्रमाण पत्र | Fee Paid Certificate
Search name / admission no / roll | नाम / प्रवेश नंबर / रोल नंबर से खोजें | Naam / admission no / roll se khojein
`;
