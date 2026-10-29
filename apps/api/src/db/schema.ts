// Every table that holds centre data carries centre_id. No query may cross centres.
import { pgTable, uuid, text, timestamp, integer, boolean, date, pgEnum, numeric } from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', ['SUPER_ADMIN', 'ADMIN', 'FACULTY', 'STAFF', 'STUDENT', 'PARENT', 'EXPERT']);
export const attendanceStatus = pgEnum('attendance_status', ['PRESENT', 'ABSENT', 'LATE', 'LEAVE']);
export const noticeType = pgEnum('notice_type', ['GENERAL', 'HOLIDAY', 'EXAM', 'FEE', 'EVENT', 'URGENT', 'ANNOUNCEMENT', 'GREETING']);
export const paymentMode = pgEnum('payment_mode', ['UPI', 'CASH', 'CARD', 'NETBANKING', 'CHEQUE']);

export const centres = pgTable('centres', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  city: text('city'),
  plan: text('plan').default('starter').notNull(),
  primaryColour: text('primary_colour').default('#F2A93B'),
  birthdayWish: text('birthday_wish'),
  institutionType: text('institution_type').default('coaching').notNull(), // coaching | school
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  centreId: uuid('centre_id').references(() => centres.id),
  mobile: text('mobile').notNull(),
  email: text('email'),
  name: text('name').notNull(),
  role: roleEnum('role').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const batches = pgTable('batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  centreId: uuid('centre_id').notNull().references(() => centres.id),
  name: text('name').notNull(),
  course: text('course').notNull(),
  startDate: date('start_date'),
  endDate: date('end_date'),
  capacity: integer('capacity').default(60),
  className: text('class_name'), section: text('section'), classTeacherId: uuid('class_teacher_id').references(() => users.id), sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const students = pgTable('students', {
  id: uuid('id').primaryKey().defaultRandom(),
  centreId: uuid('centre_id').notNull().references(() => centres.id),
  userId: uuid('user_id').references(() => users.id),
  batchId: uuid('batch_id').references(() => batches.id),
  rollNo: text('roll_no'),
  name: text('name').notNull(),
  className: text('class_name'),
  mobile: text('mobile'),
  parentName: text('parent_name'),
  parentMobile: text('parent_mobile').notNull(),
  dob: date('dob'),
  gender: text('gender'), admissionNo: text('admission_no'), admissionDate: date('admission_date'), fatherName: text('father_name'), motherName: text('mother_name'), address: text('address'), category: text('category'), religion: text('religion'), bloodGroup: text('blood_group'), previousSchool: text('previous_school'), photoUrl: text('photo_url'),
  leftOn: date('left_on'), leftReason: text('left_reason'),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const attendance = pgTable('attendance', {
  id: uuid('id').primaryKey().defaultRandom(),
  centreId: uuid('centre_id').notNull().references(() => centres.id),
  studentId: uuid('student_id').notNull().references(() => students.id),
  batchId: uuid('batch_id').notNull().references(() => batches.id),
  date: date('date').notNull(),
  status: attendanceStatus('status').notNull(),
  markedBy: uuid('marked_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const feePlans = pgTable('fee_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  centreId: uuid('centre_id').notNull().references(() => centres.id),
  batchId: uuid('batch_id').references(() => batches.id),
  name: text('name').notNull(),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  cycle: text('cycle').default('monthly').notNull(), // one-time | monthly | quarterly
});

export const feePayments = pgTable('fee_payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  centreId: uuid('centre_id').notNull().references(() => centres.id),
  studentId: uuid('student_id').notNull().references(() => students.id),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  mode: paymentMode('mode').notNull(),
  reference: text('reference'),
  paidOn: date('paid_on').notNull(),
  receiptNo: text('receipt_no'),
  recordedBy: uuid('recorded_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const notices = pgTable('notices', {
  id: uuid('id').primaryKey().defaultRandom(),
  centreId: uuid('centre_id').notNull().references(() => centres.id),
  batchId: uuid('batch_id').references(() => batches.id), // null = whole centre
  type: noticeType('type').default('GENERAL').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  publishedAt: timestamp('published_at').defaultNow().notNull(),
  createdBy: uuid('created_by').references(() => users.id),
  pinned: boolean('pinned').default(false).notNull(),
  imageUrl: text('image_url'),
  expiresAt: timestamp('expires_at'),
});

// ---------- Phase 1 additions ----------
export const noticeReads = pgTable('notice_reads', {
  id: uuid('id').primaryKey().defaultRandom(),
  noticeId: uuid('notice_id').notNull().references(() => notices.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  readAt: timestamp('read_at').defaultNow().notNull(),
});

export const content = pgTable('content', {
  id: uuid('id').primaryKey().defaultRandom(),
  centreId: uuid('centre_id').notNull().references(() => centres.id),
  batchId: uuid('batch_id').references(() => batches.id),
  subject: text('subject').notNull(),
  chapter: text('chapter'),
  title: text('title').notNull(),
  kind: text('kind').default('link').notNull(), // link | file | video | text
  url: text('url'),
  fileKey: text('file_key'),
  body: text('body'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  centreId: uuid('centre_id').notNull().references(() => centres.id),
  room: text('room').notNull(), // batch:<id> | dm:<userA>_<userB> | parent:<centre>_<userId>
  senderId: uuid('sender_id').notNull().references(() => users.id),
  senderName: text('sender_name').notNull(),
  senderRole: text('sender_role').notNull(),
  text: text('text').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const timetableSlots = pgTable('timetable_slots', {
  id: uuid('id').primaryKey().defaultRandom(),
  centreId: uuid('centre_id').notNull().references(() => centres.id),
  batchId: uuid('batch_id').notNull().references(() => batches.id),
  facultyId: uuid('faculty_id').references(() => users.id),
  weekday: integer('weekday').notNull(), // 0=Sun..6=Sat
  startTime: text('start_time').notNull(), // HH:MM
  endTime: text('end_time').notNull(),
  subject: text('subject').notNull(),
  room: text('room'),
});

export const facultyBatches = pgTable('faculty_batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  centreId: uuid('centre_id').notNull().references(() => centres.id),
  facultyId: uuid('faculty_id').notNull().references(() => users.id),
  batchId: uuid('batch_id').notNull().references(() => batches.id),
  subject: text('subject'),
});

export const studentFeePlans = pgTable('student_fee_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  centreId: uuid('centre_id').notNull().references(() => centres.id),
  studentId: uuid('student_id').notNull().references(() => students.id),
  planId: uuid('plan_id').notNull().references(() => feePlans.id),
  startDate: date('start_date').notNull(),
  discount: numeric('discount', { precision: 10, scale: 2 }).default('0').notNull(),
});

export const notificationLog = pgTable('notification_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  centreId: uuid('centre_id').notNull().references(() => centres.id),
  userId: uuid('user_id').references(() => users.id),
  channel: text('channel').notNull(), // push | whatsapp | sms
  title: text('title').notNull(),
  body: text('body').notNull(),
  status: text('status').default('queued').notNull(), // queued | sent | failed | skipped
  error: text('error'),
  data: text('data'), // JSON deep-link payload
  readAt: timestamp('read_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const deviceTokens = pgTable('device_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  token: text('token').notNull(),
  platform: text('platform').default('android').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ---------- Phase 2: tests, homework, live classes ----------
export const tests = pgTable('tests', {
  id: uuid('id').primaryKey().defaultRandom(),
  centreId: uuid('centre_id').notNull().references(() => centres.id),
  batchId: uuid('batch_id').notNull().references(() => batches.id),
  title: text('title').notNull(),
  subject: text('subject'),
  mode: text('mode').default('online').notNull(), // online (MCQ auto-check) | offline (marks entry)
  date: date('date').notNull(),
  durationMin: integer('duration_min').default(60),
  maxMarks: integer('max_marks').default(100).notNull(),
  negative: numeric('negative', { precision: 4, scale: 2 }).default('0').notNull(), // marks deducted per wrong answer (online)
  questions: text('questions').default('[]').notNull(), // JSON: [{q, opts:[4], ans:'A'|'B'|'C'|'D', chapter, marks}]
  published: boolean('published').default(false).notNull(),
  resultsPublished: boolean('results_published').default(false).notNull(),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const testAttempts = pgTable('test_attempts', {
  id: uuid('id').primaryKey().defaultRandom(),
  centreId: uuid('centre_id').notNull().references(() => centres.id),
  testId: uuid('test_id').notNull().references(() => tests.id),
  studentId: uuid('student_id').notNull().references(() => students.id),
  answers: text('answers').default('{}').notNull(), // JSON {qIndex: 'A'}
  marks: numeric('marks', { precision: 7, scale: 2 }),
  chapterScores: text('chapter_scores').default('{}').notNull(), // JSON {chapter: {got, total}}
  tabSwitches: integer('tab_switches').default(0).notNull(),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  submittedAt: timestamp('submitted_at'),
});

export const homework = pgTable('homework', {
  id: uuid('id').primaryKey().defaultRandom(),
  centreId: uuid('centre_id').notNull().references(() => centres.id),
  batchId: uuid('batch_id').notNull().references(() => batches.id),
  title: text('title').notNull(),
  description: text('description'),
  subject: text('subject'),
  dueAt: timestamp('due_at').notNull(),
  attachmentUrl: text('attachment_url'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const homeworkSubmissions = pgTable('homework_submissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  homeworkId: uuid('homework_id').notNull().references(() => homework.id),
  studentId: uuid('student_id').notNull().references(() => students.id),
  text: text('text'),
  fileKeys: text('file_keys').default('[]').notNull(), // JSON array of storage keys
  submittedAt: timestamp('submitted_at').defaultNow().notNull(),
  grade: text('grade'),
  remark: text('remark'),
  checkedBy: uuid('checked_by').references(() => users.id),
  checkedAt: timestamp('checked_at'),
});

export const liveClasses = pgTable('live_classes', {
  id: uuid('id').primaryKey().defaultRandom(),
  centreId: uuid('centre_id').notNull().references(() => centres.id),
  batchId: uuid('batch_id').notNull().references(() => batches.id),
  title: text('title').notNull(),
  startAt: timestamp('start_at').notNull(),
  durationMin: integer('duration_min').default(60).notNull(),
  provider: text('provider').default('jitsi').notNull(), // jitsi | agora | external
  joinUrl: text('join_url').notNull(),
  recordingUrl: text('recording_url'),
  status: text('status').default('scheduled').notNull(), // scheduled | live | ended | cancelled
  createdBy: uuid('created_by').references(() => users.id),
});

export const liveAttendance = pgTable('live_attendance', {
  id: uuid('id').primaryKey().defaultRandom(),
  liveClassId: uuid('live_class_id').notNull().references(() => liveClasses.id),
  studentId: uuid('student_id').notNull().references(() => students.id),
  joinedAt: timestamp('joined_at').defaultNow().notNull(),
  leftAt: timestamp('left_at'),
  minutes: integer('minutes').default(0).notNull(),
});

// ---------- Staff privileges, doubts, leave requests, feedback, enquiries ----------
export const staffPermissions = pgTable('staff_permissions', {
  userId: uuid('user_id').primaryKey().references(() => users.id),
  centreId: uuid('centre_id').notNull().references(() => centres.id),
  modules: text('modules').default('[]').notNull(), // JSON array of module keys the staff member may use
  active: boolean('active').default(true).notNull(),
  title: text('title'), // e.g. Receptionist, Physics faculty, Accountant
});

export const doubts = pgTable('doubts', {
  id: uuid('id').primaryKey().defaultRandom(),
  centreId: uuid('centre_id').notNull().references(() => centres.id),
  studentId: uuid('student_id').notNull().references(() => students.id),
  batchId: uuid('batch_id').references(() => batches.id),
  subject: text('subject').notNull(),
  question: text('question').notNull(),
  imageUrl: text('image_url'),
  answer: text('answer'),
  answeredBy: uuid('answered_by').references(() => users.id),
  answeredAt: timestamp('answered_at'),
  resolved: boolean('resolved').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const leaveRequests = pgTable('leave_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  centreId: uuid('centre_id').notNull().references(() => centres.id),
  studentId: uuid('student_id').notNull().references(() => students.id),
  fromDate: date('from_date').notNull(),
  toDate: date('to_date').notNull(),
  reason: text('reason').notNull(),
  status: text('status').default('pending').notNull(), // pending | approved | rejected
  decidedBy: uuid('decided_by').references(() => users.id),
  note: text('note'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const feedback = pgTable('feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  centreId: uuid('centre_id').notNull().references(() => centres.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  studentId: uuid('student_id').references(() => students.id),
  kind: text('kind').default('feedback').notNull(), // feedback | complaint | suggestion
  text: text('text').notNull(),
  status: text('status').default('open').notNull(), // open | replied | closed
  reply: text('reply'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const enquiries = pgTable('enquiries', {
  id: uuid('id').primaryKey().defaultRandom(),
  centreId: uuid('centre_id').notNull().references(() => centres.id),
  name: text('name').notNull(),
  mobile: text('mobile').notNull(),
  className: text('class_name'),
  course: text('course'),
  source: text('source').default('walk-in').notNull(), // walk-in | phone | website | referral | social
  status: text('status').default('new').notNull(), // new | contacted | demo | admitted | lost
  nextFollowUp: date('next_follow_up'),
  notes: text('notes'),
  assignedTo: uuid('assigned_to').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ---------- Platform: feature flags, subscription billing, online-class providers ----------
export const centreSettings = pgTable('centre_settings', {
  centreId: uuid('centre_id').primaryKey().references(() => centres.id),
  features: text('features').default('[]').notNull(), // JSON array of enabled module keys (empty = all on)
  pricePerStudent: numeric('price_per_student', { precision: 8, scale: 2 }).default('40').notNull(),
  minStudents: integer('min_students').default(50).notNull(),
  billingCycle: text('billing_cycle').default('monthly').notNull(), // monthly | annual
  trialEndsAt: date('trial_ends_at'),
  paidUntil: date('paid_until'),
  status: text('status').default('trial').notNull(), // trial | active | grace | suspended
  liveProvider: text('live_provider').default('jitsi').notNull(), // jitsi | zoom | meet | teams | custom
  zoomAccountId: text('zoom_account_id'), zoomClientId: text('zoom_client_id'), zoomClientSecret: text('zoom_client_secret'),
  defaultMeetingUrl: text('default_meeting_url'), // for meet/teams/custom: the centre's standing room link
  // The centre's own email account: OTPs, notices and receipts for this centre go out from here.
  smtpHost: text('smtp_host'), smtpPort: integer('smtp_port'), smtpUser: text('smtp_user'), smtpPass: text('smtp_pass'), smtpFrom: text('smtp_from'), smtpVerifiedAt: timestamp('smtp_verified_at'),
  // School profile (letterhead for certificates / report cards)
  academicSession: text('academic_session'), board: text('board'), udiseCode: text('udise_code'), affiliationNo: text('affiliation_no'), principalName: text('principal_name'), address: text('address'), phone: text('phone'), website: text('website'), gradeScale: text('grade_scale'), biometricKey: text('biometric_key'),
  // White-label app
  appName: text('app_name'), packageId: text('package_id'), appColour: text('app_colour'), appLogoUrl: text('app_logo_url'), appIconUrl: text('app_icon_url'), playStoreUrl: text('play_store_url'),
  // Centre's own PayU for student fee collection
  payuKey: text('payu_key'), payuSalt: text('payu_salt'), payuTest: boolean('payu_test').default(true).notNull(), manualPayInfo: text('manual_pay_info'),
  lat: numeric('lat', { precision: 10, scale: 7 }), lng: numeric('lng', { precision: 10, scale: 7 }), geofenceM: integer('geofence_m').default(15).notNull(), gpsToleranceM: integer('gps_tolerance_m').default(5).notNull(),
  workStart: text('work_start').default('09:00').notNull(), lateAfterMin: integer('late_after_min').default(15).notNull(), halfDayMin: integer('half_day_min').default(240).notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const subscriptionInvoices = pgTable('subscription_invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  centreId: uuid('centre_id').notNull().references(() => centres.id),
  periodFrom: date('period_from').notNull(),
  periodTo: date('period_to').notNull(),
  students: integer('students').notNull(),
  pricePerStudent: numeric('price_per_student', { precision: 8, scale: 2 }).notNull(),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  status: text('status').default('due').notNull(), // due | paid | void
  paidOn: date('paid_on'),
  mode: text('mode'), reference: text('reference'), paymentLink: text('payment_link'),
  claimedRef: text('claimed_ref'), claimedAt: timestamp('claimed_at'), claimedNote: text('claimed_note'), // owner says "paid manually" → super-admin approves
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ---------- Staff attendance with geofence ----------
export const staffAttendance = pgTable('staff_attendance', {
  id: uuid('id').primaryKey().defaultRandom(),
  centreId: uuid('centre_id').notNull().references(() => centres.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  date: date('date').notNull(),
  checkIn: timestamp('check_in'),
  checkOut: timestamp('check_out'),
  inLat: numeric('in_lat', { precision: 10, scale: 7 }), inLng: numeric('in_lng', { precision: 10, scale: 7 }), inDistanceM: integer('in_distance_m'),
  outLat: numeric('out_lat', { precision: 10, scale: 7 }), outLng: numeric('out_lng', { precision: 10, scale: 7 }), outDistanceM: integer('out_distance_m'),
  status: text('status').default('present').notNull(), // present | late | half-day | absent | leave | manual
  minutes: integer('minutes').default(0).notNull(),
  note: text('note'),
  markedBy: uuid('marked_by').references(() => users.id), // set when the owner marks manually
});

// ---------- Wellbeing & counselling (platform experts, confidential) ----------
export const wellbeingRequests = pgTable('wellbeing_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  centreId: uuid('centre_id').notNull().references(() => centres.id),
  studentId: uuid('student_id').references(() => students.id),
  requesterId: uuid('requester_id').notNull().references(() => users.id), // student or parent
  requesterRole: text('requester_role').notNull(),
  category: text('category').notNull(), // exam-stress | anxiety | focus | family | bullying | career | other
  text: text('text').notNull(),
  urgency: text('urgency').default('normal').notNull(), // normal | urgent
  status: text('status').default('new').notNull(), // new | assigned | scheduled | in-progress | closed
  expertId: uuid('expert_id').references(() => users.id),
  sessionAt: timestamp('session_at'),
  sessionUrl: text('session_url'),
  expertNotes: text('expert_notes'), // private to experts
  closedAt: timestamp('closed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const wellbeingMessages = pgTable('wellbeing_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  requestId: uuid('request_id').notNull().references(() => wellbeingRequests.id),
  senderId: uuid('sender_id').notNull().references(() => users.id),
  senderRole: text('sender_role').notNull(),
  text: text('text').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const wellbeingPosts = pgTable('wellbeing_posts', {
  id: uuid('id').primaryKey().defaultRandom(),
  expertId: uuid('expert_id').notNull().references(() => users.id),
  title: text('title').notNull(),
  body: text('body').notNull(),
  audience: text('audience').default('all').notNull(), // all | students | parents
  publishedAt: timestamp('published_at').defaultNow().notNull(),
});

// ---------- Platform settings (single row id='platform'): super-admin mailbox + OTP switch ----------
export const platformSettings = pgTable('platform_settings', {
  id: text('id').primaryKey(), // 'platform'
  smtpHost: text('smtp_host'), smtpPort: integer('smtp_port'), smtpUser: text('smtp_user'), smtpPass: text('smtp_pass'), smtpFrom: text('smtp_from'), smtpVerifiedAt: timestamp('smtp_verified_at'),
  otpEnabled: boolean('otp_enabled').default(false).notNull(),
  payuKey: text('payu_key'), payuSalt: text('payu_salt'), payuTest: boolean('payu_test').default(true).notNull(),
  manualPayInfo: text('manual_pay_info'), // shown on the payment wall: UPI id, bank details, WhatsApp number
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ---------- Generic records (school modules: transport, library, inventory, discipline, health, events, ...) ----------
export const records = pgTable('records', {
  id: uuid('id').primaryKey().defaultRandom(),
  centreId: uuid('centre_id').notNull().references(() => centres.id),
  kind: text('kind').notNull(), // see src/records/kinds.ts
  studentId: uuid('student_id').references(() => students.id),
  staffId: uuid('staff_id').references(() => users.id),
  refId: uuid('ref_id'), // link to another record (loan → book, assignment → route, stock move → item)
  title: text('title').notNull(),
  date: date('date'),
  status: text('status').default('open').notNull(),
  data: text('data').default('{}').notNull(), // JSON of the kind's fields
  parentVisible: boolean('parent_visible').default(false).notNull(),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ---------- Exams & report cards (school) ----------
export const exams = pgTable('exams', {
  id: uuid('id').primaryKey().defaultRandom(),
  centreId: uuid('centre_id').notNull().references(() => centres.id),
  batchId: uuid('batch_id').notNull().references(() => batches.id),
  name: text('name').notNull(), // Unit test 1, Half-yearly, Annual
  term: text('term').default('Term 1').notNull(),
  session: text('session'),
  subjects: text('subjects').default('[]').notNull(), // JSON [{name, max}]
  date: date('date'),
  published: boolean('published').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
export const examMarks = pgTable('exam_marks', {
  id: uuid('id').primaryKey().defaultRandom(),
  examId: uuid('exam_id').notNull().references(() => exams.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').notNull().references(() => students.id),
  subject: text('subject').notNull(),
  marks: numeric('marks', { precision: 6, scale: 2 }),
  absent: boolean('absent').default(false).notNull(),
});
