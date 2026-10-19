// Every table that holds centre data carries centre_id. No query may cross centres.
import { pgTable, uuid, text, timestamp, integer, boolean, date, pgEnum, numeric } from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', ['SUPER_ADMIN', 'ADMIN', 'FACULTY', 'STUDENT', 'PARENT']);
export const attendanceStatus = pgEnum('attendance_status', ['PRESENT', 'ABSENT', 'LATE', 'LEAVE']);
export const noticeType = pgEnum('notice_type', ['GENERAL', 'HOLIDAY', 'EXAM', 'FEE', 'EVENT', 'URGENT']);
export const paymentMode = pgEnum('payment_mode', ['UPI', 'CASH', 'CARD', 'NETBANKING', 'CHEQUE']);

export const centres = pgTable('centres', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  city: text('city'),
  plan: text('plan').default('starter').notNull(),
  primaryColour: text('primary_colour').default('#F2A93B'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  centreId: uuid('centre_id').references(() => centres.id),
  mobile: text('mobile').notNull(),
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
});
