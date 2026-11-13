import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Post, Put, Query } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { batches, centreSettings, records, students } from '../db/schema';
import { Roles } from '../common/auth.guard';
import { Mod } from '../common/permissions';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { centreOf } from '../common/tenant';
import { PlatformService } from '../platform/platform.service';
import { addDays, amountsFor, availableCopies, cleanBook } from './library';

const today = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const J = (s: string) => { try { return JSON.parse(s || '{}'); } catch { return {}; } };
const OUT = ['issued', 'overdue']; // loans that still hold a copy

/**
 * Library: add books (name, author, publisher, category, value), keep categories, issue to students, take back with a late fine
 * or a lost / damaged charge. It stores its data in the same `records` table as the older Books and Book loans screens (kinds
 * 'book' and 'loan'), so nothing already entered is lost, and parents still see their child's loans.
 */
@Controller('library')
@Mod('library')
@Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
export class LibraryController {
  constructor(private dbs: DbService, private platform: PlatformService) {}

  private async rules(centreId: string) { const s: any = await this.platform.settings(centreId); return { loanDays: Number(s.libraryLoanDays ?? 14), finePerDay: Number(s.libraryFinePerDay ?? 0) }; }
  private book(r: typeof records.$inferSelect, out: number, fallbackFine: number) { const d = J(r.data); const copies = Number(d.copies ?? 1); return { id: r.id, title: r.title, status: r.status, author: d.author || '', publisher: d.publisher || '', category: d.category || '', isbn: d.isbn || '', shelf: d.shelf || '', copies, value: Number(d.price ?? d.value ?? 0), finePerDay: d.finePerDay === null || d.finePerDay === undefined || d.finePerDay === '' ? null : Number(d.finePerDay), effectiveFine: d.finePerDay === null || d.finePerDay === undefined || d.finePerDay === '' ? fallbackFine : Number(d.finePerDay), issued: out, available: availableCopies(copies, out) }; }
  private bookData(v: ReturnType<typeof cleanBook> extends infer R ? (R extends { ok: infer O } ? O : never) : never) { return { author: v.author, publisher: v.publisher, category: v.category, isbn: v.isbn, shelf: v.shelf, copies: v.copies, price: v.value, finePerDay: v.finePerDay }; }

  /** Everything the Library screen needs in one call. */
  @Get() async overview(@CurrentUser() u: JwtUser, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const rules = await this.rules(centreId); const t = today();
    const rows = await db.select().from(records).where(and(eq(records.centreId, centreId), eq(records.kind, 'book'))).orderBy(records.title);
    const loanRows = await db.select({ r: records, name: students.name, cls: students.className, adm: students.admissionNo, roll: students.rollNo, bname: batches.name }).from(records).leftJoin(students, eq(students.id, records.studentId)).leftJoin(batches, eq(batches.id, students.batchId)).where(and(eq(records.centreId, centreId), eq(records.kind, 'loan'))).orderBy(desc(records.createdAt)).limit(1000);
    const titles = new Map(rows.map((b) => [b.id, b.title]));
    const out = new Map<string, number>(); for (const l of loanRows) if (l.r.refId && OUT.includes(l.r.status)) out.set(l.r.refId, (out.get(l.r.refId) || 0) + 1);
    const cats = await db.select().from(records).where(and(eq(records.centreId, centreId), eq(records.kind, 'book-category'))).orderBy(records.title);
    const loans = loanRows.map((l) => { const d = J(l.r.data); const open = OUT.includes(l.r.status); const due = d.dueDate || l.r.date || t; const a = open ? amountsFor({ dueDate: due, today: t, finePerDay: rules.finePerDay, value: 0 }) : null; return { id: l.r.id, bookId: l.r.refId, book: titles.get(l.r.refId || '') || l.r.title, studentId: l.r.studentId, student: l.name || '', className: l.bname || l.cls || '', admissionNo: l.adm || l.roll || '', issuedOn: l.r.date, dueDate: due, returnedOn: d.returnedOn || null, status: open && due < t ? 'overdue' : l.r.status, daysLate: a ? a.days : Number(d.daysLate || 0), fineNow: a ? a.late : 0, fine: Number(d.fine || 0), charge: Number(d.charge || 0), finePaid: !!d.finePaid, note: d.note || '' }; });
    const books = rows.map((b) => this.book(b, out.get(b.id) || 0, rules.finePerDay));
    const categories = cats.map((x) => ({ id: x.id, name: x.title, books: books.filter((b) => b.category.toLowerCase() === x.title.toLowerCase()).length }));
    return { books, categories, loans, rules, today: t, stats: { titles: books.length, copies: books.reduce((a, b) => a + b.copies, 0), out: loans.filter((l) => OUT.includes(l.status)).length, overdue: loans.filter((l) => l.status === 'overdue').length, unpaid: loans.filter((l) => !OUT.includes(l.status) && (l.fine + l.charge) > 0 && !l.finePaid).reduce((a, l) => a + l.fine + l.charge, 0) } };
  }

  // ---------- books ----------
  @Post('books') async addBook(@CurrentUser() u: JwtUser, @Body() b: any, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const r = cleanBook(b); if ('error' in r) throw new BadRequestException(r.error); const v = r.ok;
    const [row] = await this.dbs.db.insert(records).values({ centreId, kind: 'book', title: v.title, status: 'available', data: JSON.stringify(this.bookData(v)), createdBy: u.id }).returning();
    if (v.category) await this.ensureCategory(centreId, v.category);
    return { id: row.id };
  }
  @Put('books/:id') async editBook(@CurrentUser() u: JwtUser, @Param('id') id: string, @Body() b: any, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const [old] = await db.select().from(records).where(and(eq(records.id, id), eq(records.centreId, centreId), eq(records.kind, 'book'))); if (!old) throw new NotFoundException();
    const r = cleanBook(b); if ('error' in r) throw new BadRequestException(r.error); const v = r.ok;
    const status = ['available', 'lost', 'withdrawn'].includes(b?.status) ? b.status : old.status;
    await db.update(records).set({ title: v.title, status, data: JSON.stringify({ ...J(old.data), ...this.bookData(v) }), updatedAt: new Date() }).where(eq(records.id, id));
    if (v.category) await this.ensureCategory(centreId, v.category); return { ok: true };
  }
  @Delete('books/:id') @Roles('SUPER_ADMIN', 'ADMIN') async removeBook(@CurrentUser() u: JwtUser, @Param('id') id: string, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const [any] = await db.select({ id: records.id }).from(records).where(and(eq(records.centreId, centreId), eq(records.kind, 'loan'), eq(records.refId, id))).limit(1);
    if (any) { await db.update(records).set({ status: 'withdrawn', updatedAt: new Date() }).where(and(eq(records.id, id), eq(records.centreId, centreId))); return { ok: true, withdrawn: true }; } // it has history: keep the record, just take it off the shelf
    await db.delete(records).where(and(eq(records.id, id), eq(records.centreId, centreId), eq(records.kind, 'book'))); return { ok: true, withdrawn: false };
  }

  // ---------- categories (the owner decides the list) ----------
  private async ensureCategory(centreId: string, name: string) { const db = this.dbs.db; const all = await db.select().from(records).where(and(eq(records.centreId, centreId), eq(records.kind, 'book-category'))); if (!all.some((x) => x.title.toLowerCase() === name.toLowerCase())) await db.insert(records).values({ centreId, kind: 'book-category', title: name, status: 'active' }); }
  @Post('categories') async addCategory(@CurrentUser() u: JwtUser, @Body() b: { name: string }, @Query('centreId') c?: string) { const name = String(b?.name || '').trim().slice(0, 60); if (!name) throw new BadRequestException('Enter a category name.'); await this.ensureCategory(centreOf(u, c), name); return { ok: true }; }
  @Put('categories/:id') async renameCategory(@CurrentUser() u: JwtUser, @Param('id') id: string, @Body() b: { name: string }, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const name = String(b?.name || '').trim().slice(0, 60); if (!name) throw new BadRequestException('Enter a category name.');
    const [old] = await db.select().from(records).where(and(eq(records.id, id), eq(records.centreId, centreId), eq(records.kind, 'book-category'))); if (!old) throw new NotFoundException();
    await db.update(records).set({ title: name, updatedAt: new Date() }).where(eq(records.id, id));
    const books = await db.select().from(records).where(and(eq(records.centreId, centreId), eq(records.kind, 'book'))); // books keep their category name, so rename it there too
    for (const bk of books) { const d = J(bk.data); if (String(d.category || '').toLowerCase() === old.title.toLowerCase()) await db.update(records).set({ data: JSON.stringify({ ...d, category: name }) }).where(eq(records.id, bk.id)); }
    return { ok: true };
  }
  @Delete('categories/:id') async removeCategory(@CurrentUser() u: JwtUser, @Param('id') id: string, @Query('centreId') c?: string) { await this.dbs.db.delete(records).where(and(eq(records.id, id), eq(records.centreId, centreOf(u, c)), eq(records.kind, 'book-category'))); return { ok: true }; } // books keep the name they have

  // ---------- rules: loan days and the default fine ----------
  @Put('rules') @Roles('SUPER_ADMIN', 'ADMIN') async setRules(@CurrentUser() u: JwtUser, @Body() b: { loanDays: number; finePerDay: number }, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const loanDays = Math.round(Number(b?.loanDays)); const finePerDay = Math.round(Number(b?.finePerDay));
    if (!(loanDays >= 1 && loanDays <= 365)) throw new BadRequestException('Loan days must be between 1 and 365.'); if (!(finePerDay >= 0 && finePerDay <= 10000)) throw new BadRequestException('Fine per day must be 0 or more.');
    await this.dbs.db.update(centreSettings).set({ libraryLoanDays: loanDays, libraryFinePerDay: finePerDay, updatedAt: new Date() }).where(eq(centreSettings.centreId, centreId)); return { ok: true };
  }

  // ---------- issue and return ----------
  @Post('issue') async issue(@CurrentUser() u: JwtUser, @Body() b: { bookId: string; studentId: string; dueDate?: string }, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const t = today();
    const [bk] = await db.select().from(records).where(and(eq(records.id, b?.bookId || ''), eq(records.centreId, centreId), eq(records.kind, 'book'))); if (!bk) throw new BadRequestException('Choose a book.');
    const [st] = await db.select().from(students).where(and(eq(students.id, b?.studentId || ''), eq(students.centreId, centreId))); if (!st) throw new BadRequestException('Choose a student.');
    if (bk.status !== 'available') throw new BadRequestException(`This book is marked “${bk.status}” and cannot be issued.`);
    const outNow = (await db.select({ id: records.id }).from(records).where(and(eq(records.centreId, centreId), eq(records.kind, 'loan'), eq(records.refId, bk.id), eq(records.status, 'issued')))).length;
    if (availableCopies(Number(J(bk.data).copies ?? 1), outNow) < 1) throw new BadRequestException('All copies of this book are already issued.');
    const rules = await this.rules(centreId); const due = b.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(b.dueDate) ? b.dueDate : addDays(t, rules.loanDays); if (due < t) throw new BadRequestException('The due date is before today.');
    const [row] = await db.insert(records).values({ centreId, kind: 'loan', studentId: st.id, refId: bk.id, title: bk.title, date: t, status: 'issued', data: JSON.stringify({ dueDate: due }), parentVisible: true, createdBy: u.id }).returning();
    return { id: row.id, dueDate: due };
  }

  /** Take a book back. lost = the student lost it (charged the book's value); damagedCharge = extra rupees for damage; waive = no late fine. */
  @Post('return/:id') async giveBack(@CurrentUser() u: JwtUser, @Param('id') id: string, @Body() b: { lost?: boolean; damagedCharge?: number; waive?: boolean; note?: string }, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const t = today();
    const [ln] = await db.select().from(records).where(and(eq(records.id, id), eq(records.centreId, centreId), eq(records.kind, 'loan'))); if (!ln) throw new NotFoundException();
    if (!OUT.includes(ln.status)) throw new BadRequestException('This book is already back.');
    const d = J(ln.data); const [bk] = ln.refId ? await db.select().from(records).where(eq(records.id, ln.refId)) : []; const bd = bk ? J(bk.data) : {}; const rules = await this.rules(centreId);
    const fpd = bd.finePerDay === null || bd.finePerDay === undefined || bd.finePerDay === '' ? rules.finePerDay : Number(bd.finePerDay);
    const a = amountsFor({ dueDate: d.dueDate || ln.date || t, returnedOn: t, today: t, finePerDay: fpd, value: Number(bd.price ?? bd.value ?? 0), lost: !!b?.lost, damagedCharge: Number(b?.damagedCharge || 0), waive: !!b?.waive });
    const status = b?.lost ? 'lost' : 'returned';
    await db.update(records).set({ status, data: JSON.stringify({ ...d, returnedOn: t, daysLate: a.days, fine: a.late + a.damaged, charge: a.lostCharge, finePaid: a.total === 0, note: String(b?.note || '').slice(0, 200) }), updatedAt: new Date() }).where(eq(records.id, id));
    if (b?.lost && bk) await db.update(records).set({ data: JSON.stringify({ ...bd, copies: Math.max(0, Number(bd.copies ?? 1) - 1) }), updatedAt: new Date() }).where(eq(records.id, bk.id)); // a lost copy leaves the shelf
    return { ok: true, status, ...a };
  }
  /** The fine / charge has been collected from the student. */
  @Post('loans/:id/paid') async fineCollected(@CurrentUser() u: JwtUser, @Param('id') id: string, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const [ln] = await db.select().from(records).where(and(eq(records.id, id), eq(records.centreId, centreId), eq(records.kind, 'loan'))); if (!ln) throw new NotFoundException();
    await db.update(records).set({ data: JSON.stringify({ ...J(ln.data), finePaid: true }), updatedAt: new Date() }).where(eq(records.id, id)); return { ok: true };
  }
}
