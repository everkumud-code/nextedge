import 'package:flutter/material.dart';
import '../api.dart';
import '../widgets.dart';
import 'chat.dart';
import 'news.dart';
import 'school.dart';
import 'tests.dart';

// The parent portal of the phone app: one login, every child linked to the parent's mobile number, read-only screens
// (Today, Progress, Attendance, Homework, Fees, More). It uses the same API as the website's parent portal
// (/parent/overview and /parent/child/:id) plus the endpoints for exams, homework, notices, leave, receipts and PTM slots.

String _err(Object e) => e.toString().replaceFirst('Exception: ', '');
String _inr(num n) => '₹${n.round()}';
String _ymd(dynamic d) => d == null ? '' : d.toString().substring(0, d.toString().length < 10 ? d.toString().length : 10);
const _months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
String _monthName(String ym) { final p = ym.split('-'); if (p.length < 2) return ym; final m = int.tryParse(p[1]) ?? 1; return '${_months[(m - 1).clamp(0, 11)]} ${p[0]}'; }
Color _pctColour(num? p) => p == null ? Colors.grey : p >= 75 ? Colors.green.shade700 : p >= 50 ? Colors.orange.shade800 : Colors.red.shade700;
void _snack(BuildContext c, String m) { if (c.mounted) ScaffoldMessenger.of(c).showSnackBar(SnackBar(content: Text(m))); }

/// The children of this login and which one is open. Every parent screen listens to it and follows the chosen child.
class ParentModel extends ChangeNotifier {
  List kids = [];
  int index = 0;
  int unread = 0;
  bool loaded = false;
  String? error;

  Map? get cur => kids.isEmpty ? null : kids[index.clamp(0, kids.length - 1)] as Map;
  String? get curId => cur == null ? null : cur!['id'] as String?;

  Future<void> load() async {
    try {
      final r = await Api.get('/parent/overview');
      kids = (r['children'] as List?) ?? [];
      unread = ((r['unreadNotices'] as num?) ?? 0).toInt();
      error = null;
    } catch (e) {
      error = _err(e);
    }
    loaded = true;
    notifyListeners();
  }

  void pick(int i) { index = i; notifyListeners(); }
}

/// Base for a screen that shows one child: loads again whenever the chosen child changes.
abstract class ChildState<T extends StatefulWidget> extends State<T> {
  ParentModel get model;
  String? _for;
  Future<void> loadFor(Map kid);

  @override
  void initState() {
    super.initState();
    model.addListener(_sync);
    final k = model.cur;
    _for = model.curId;
    if (k != null) { Future.microtask(() => loadFor(k)); }
  }

  @override
  void dispose() { model.removeListener(_sync); super.dispose(); }

  void _sync() {
    final k = model.cur;
    final id = model.curId;
    if (id != _for) {
      _for = id;
      if (k != null) { loadFor(k); }
    }
    if (mounted) { setState(() {}); }
  }
}

class KidPicker extends StatelessWidget {
  final ParentModel model;
  const KidPicker(this.model, {super.key});
  @override
  Widget build(BuildContext context) {
    if (model.kids.length < 2) return const SizedBox();
    return Padding(padding: const EdgeInsets.only(bottom: 8), child: Wrap(spacing: 8, children: [
      for (int i = 0; i < model.kids.length; i++)
        ChoiceChip(label: Text('${model.kids[i]['name']}'), selected: i == model.index, onSelected: (_) => model.pick(i)),
    ]));
  }
}

/// The header every child screen starts with: picker plus "Class 4 · Section A · Roll 3".
Widget _kidHeader(ParentModel m) {
  final k = m.cur;
  if (k == null) return const SizedBox();
  final line = [k['className'], (k['section'] ?? '').toString().isEmpty ? null : 'Section ${k['section']}', k['rollNo'] == null ? null : 'Roll ${k['rollNo']}'].where((x) => x != null && x.toString().isNotEmpty).join(' · ');
  return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [KidPicker(m), Text('${k['name']}${line.isEmpty ? '' : ' · $line'}', style: const TextStyle(fontWeight: FontWeight.w600)), const SizedBox(height: 8)]);
}

Widget _empty(String t) => Padding(padding: const EdgeInsets.symmetric(vertical: 8), child: Text(t, style: const TextStyle(color: Colors.grey)));

/// Shown when there is nothing to show yet (still loading, no child linked, or an error).
Widget? _gate(ParentModel m, {Object? data, String? err}) {
  if (!m.loaded) return const Center(child: CircularProgressIndicator());
  if (m.error != null) return Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(m.error!, textAlign: TextAlign.center)));
  if (m.kids.isEmpty) return const Center(child: Padding(padding: EdgeInsets.all(24), child: Text('No student is linked to this login yet. Please ask the school office to add your mobile number to your child’s record.', textAlign: TextAlign.center)));
  if (err != null) return Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(err, textAlign: TextAlign.center)));
  if (data == null) return const Center(child: CircularProgressIndicator());
  return null;
}

Future<void> _payNow(BuildContext context, String studentId, num balance) async {
  try {
    final r = await Api.post('/fees/pay-link', {'studentId': studentId});
    if (r['url'] != null) { await openUrl(r['url'] as String); return; }
    _snack(context, (r['error'] ?? 'Online payment is not available. Please pay at the school office.').toString());
  } catch (e) {
    _snack(context, _err(e));
  }
}

// ---------------------------------------------------------------------------------------------------------------- Today
class TodayPage extends StatefulWidget {
  final ParentModel model; final void Function(int) onGo;
  const TodayPage(this.model, this.onGo, {super.key});
  @override State<TodayPage> createState() => _TodayState();
}
class _TodayState extends ChildState<TodayPage> {
  @override ParentModel get model => widget.model;
  Map? d; String? err; List notices = [];

  @override
  Future<void> loadFor(Map kid) async {
    if (mounted) setState(() { d = null; err = null; });
    try {
      final r = await Api.get('/parent/child/${kid['id']}');
      try { notices = await Api.get('/notices'); } catch (_) {}
      if (!mounted || model.curId != kid['id']) return;
      setState(() => d = Map<String, dynamic>.from(r as Map));
    } catch (e) { if (mounted) setState(() => err = _err(e)); }
  }

  Future<void> reload() async { await model.load(); final k = model.cur; if (k != null) await loadFor(k); }
  int _tab(String to) => to.startsWith('/p/progress') ? 1 : to.startsWith('/p/attendance') ? 2 : to.startsWith('/p/homework') ? 3 : to.startsWith('/p/fees') ? 4 : to.startsWith('/p/') ? 5 : 0;

  @override
  Widget build(BuildContext context) {
    final g = _gate(model, data: d, err: err);
    if (g != null) return g;
    final m = d!; final att = (m['attendance'] as Map?) ?? {}; final months = (att['months'] as List?) ?? []; final fees = m['fees'] as Map?;
    final pct = months.isEmpty ? null : months.first['pct'] as num?; final bal = fees == null ? 0 : (fees['balance'] as num);
    final wd = DateTime.now().weekday % 7; final week = (m['week'] as List?) ?? []; final today = week.where((w) => w['weekday'] == wd).toList();
    final periods = today.isEmpty ? [] : (today.first['periods'] as List);
    final upcoming = (m['upcomingExams'] as List?) ?? [];
    var alerts = <Map>[for (final k in model.kids) for (final a in (k['alerts'] as List? ?? [])) a as Map];
    if (alerts.any((a) => a['to'] != '/')) alerts = alerts.where((a) => a['to'] != '/').toList();
    return RefreshIndicator(onRefresh: reload, child: ListView(padding: const EdgeInsets.all(16), children: [
      AnnouncementBanner(notices),
      _kidHeader(model),
      for (final a in alerts) Card(
        color: a['level'] == 'bad' ? Colors.red.shade50 : a['level'] == 'warn' ? Colors.orange.shade50 : a['level'] == 'good' ? Colors.green.shade50 : Colors.blue.shade50,
        child: ListTile(
          leading: Icon(a['level'] == 'bad' ? Icons.warning_amber : a['level'] == 'warn' ? Icons.notifications_active_outlined : a['level'] == 'good' ? Icons.check_circle_outline : Icons.info_outline),
          title: Text('${a['text']}', style: const TextStyle(fontSize: 14)),
          onTap: () => widget.onGo(_tab('${a['to']}'))),
      ),
      Row(children: [
        Stat('attendance (month)', pct == null ? '—' : '$pct%', color: _pctColour(pct)),
        Stat('fee due', _inr(bal), color: bal > 0 ? Colors.red : Colors.green),
      ]),
      if (bal > 0) Padding(padding: const EdgeInsets.symmetric(vertical: 6), child: FilledButton.icon(icon: const Icon(Icons.currency_rupee), label: Text('Pay ${_inr(bal)} now'), onPressed: () => _payNow(context, model.curId!, bal))),
      Section('Today’s classes', periods.isEmpty ? [_empty('No classes scheduled today.')] : [for (final p in periods) ListTile(dense: true, contentPadding: EdgeInsets.zero, leading: Text('${p['start']}–${p['end']}', style: const TextStyle(fontSize: 12)), title: Text('${p['subject']}'), subtitle: Text([p['teacher'], p['room']].where((x) => x != null && x.toString().isNotEmpty).join(' · ')))]),
      if (upcoming.isNotEmpty) Section('Coming up', [for (final e in upcoming) ListTile(dense: true, contentPadding: EdgeInsets.zero, title: Text('${e['name']}'), trailing: Text(day('${e['date']}')))]),
      Section('Notices', notices.isEmpty ? [_empty('No notices yet.')] : notices.take(5).map<Widget>((n) => NoticeTile(n as Map, onOpen: () async { await Api.post('/notices/${n['id']}/read', {}); reload(); })).toList()),
    ]));
  }
}

// -------------------------------------------------------------------------------------------------------------- Progress
class ProgressPage extends StatefulWidget {
  final ParentModel model;
  const ProgressPage(this.model, {super.key});
  @override State<ProgressPage> createState() => _ProgressState();
}
class _ProgressState extends ChildState<ProgressPage> {
  @override ParentModel get model => widget.model;
  List? cards; String? err;

  @override
  Future<void> loadFor(Map kid) async {
    if (mounted) setState(() { cards = null; err = null; });
    try {
      final r = await Api.get('/exams/mine?studentId=${kid['id']}');
      if (!mounted || model.curId != kid['id']) return;
      setState(() => cards = r as List);
    } catch (e) { if (mounted) setState(() => err = _err(e)); }
  }

  @override
  Widget build(BuildContext context) {
    final g = _gate(model, data: cards, err: err);
    if (g != null) return g;
    final ok = cards!.where((c) => ((c['maxTotal'] as num?) ?? 0) > 0).toList();
    final last = ok.isEmpty ? null : ok.last as Map; final prev = ok.length < 2 ? null : ok[ok.length - 2] as Map;
    final subs = <Map<String, dynamic>>[];
    if (last != null) {
      for (final s in (last['subjects'] as List)) {
        if (s['marks'] != null && ((s['max'] as num?) ?? 0) > 0) { subs.add({'name': s['name'], 'pct': ((s['marks'] as num) / (s['max'] as num) * 100).round()}); }
      }
      subs.sort((a, b) => (b['pct'] as int).compareTo(a['pct'] as int));
    }
    final delta = last != null && prev != null ? ((last['pct'] as num) - (prev['pct'] as num)).toDouble() : null;
    return RefreshIndicator(onRefresh: () async { final k = model.cur; if (k != null) await loadFor(k); }, child: ListView(padding: const EdgeInsets.all(16), children: [
      _kidHeader(model),
      if (last == null) Card(child: Padding(padding: const EdgeInsets.all(16), child: _empty('No result has been published yet. You will see marks, grades and the class position here as soon as the school publishes them.'))) else Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Latest result: ${last['examName']}', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        Row(children: [
          Stat('percentage', '${last['pct']}%', color: _pctColour(last['pct'] as num)),
          Stat('grade', '${last['grade']}'),
          Stat('marks', '${last['total']}/${last['maxTotal']}'),
        ]),
        if (last['rank'] != null) Text('Class position #${last['rank']} of ${last['of']} students', style: const TextStyle(fontWeight: FontWeight.w600)),
        if (delta != null) Text('${delta >= 0 ? '▲' : '▼'} ${delta.abs().toStringAsFixed(1)} points since ${prev!['examName']}', style: TextStyle(color: delta >= 0 ? Colors.green.shade700 : Colors.red.shade700)),
        if (subs.length > 1) Padding(padding: const EdgeInsets.only(top: 6), child: Text('Strongest: ${subs.first['name']} (${subs.first['pct']}%). ${((subs.last['pct'] as int) < 60 ? 'Needs more help' : 'Weakest')}: ${subs.last['name']} (${subs.last['pct']}%).')),
        const SizedBox(height: 8),
        OutlinedButton.icon(icon: const Icon(Icons.picture_as_pdf), label: const Text('Download report card (PDF)'), onPressed: () => openPdf(context, '/exams/report-card/${model.curId}.pdf')),
      ]))),
      if (ok.length > 1) Section('Trend across exams', [SizedBox(height: 150, child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
        for (final c in ok) Expanded(child: Column(mainAxisAlignment: MainAxisAlignment.end, children: [
          Text('${c['pct']}%', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600)),
          Container(height: (90 * ((c['pct'] as num).clamp(0, 100) / 100)).toDouble() + 4, margin: const EdgeInsets.symmetric(horizontal: 6), color: _pctColour(c['pct'] as num)),
          Text('${c['examName']}', style: const TextStyle(fontSize: 10), maxLines: 2, textAlign: TextAlign.center, overflow: TextOverflow.ellipsis),
        ])),
      ]))]),
      if (ok.isNotEmpty) Section('Subject by subject', [
        for (final c in ok.reversed) Card(child: ExpansionTile(
          title: Text('${c['examName']} · ${c['pct']}%'), subtitle: Text('Grade ${c['grade']}${c['term'] != null ? ' · ${c['term']}' : ''}'), initiallyExpanded: identical(c, ok.last),
          children: [for (final s in (c['subjects'] as List)) ListTile(dense: true, title: Text('${s['name']}'), trailing: Text(s['absent'] == true ? 'Absent' : s['marks'] == null ? '—' : '${s['marks']}/${s['max']}  ${s['grade']}'))])),
      ]),
    ]));
  }
}

// ----------------------------------------------------------------------------------------------------------- Attendance
class AttendancePage extends StatefulWidget {
  final ParentModel model;
  const AttendancePage(this.model, {super.key});
  @override State<AttendancePage> createState() => _AttendanceState();
}
class _AttendanceState extends ChildState<AttendancePage> {
  @override ParentModel get model => widget.model;
  Map? d; String? err;
  String month = DateTime.now().toIso8601String().substring(0, 7);

  @override
  Future<void> loadFor(Map kid) async {
    if (mounted) setState(() { d = null; err = null; });
    try {
      final r = await Api.get('/parent/child/${kid['id']}');
      if (!mounted || model.curId != kid['id']) return;
      setState(() => d = Map<String, dynamic>.from(r as Map));
    } catch (e) { if (mounted) setState(() => err = _err(e)); }
  }

  void _shift(int by) {
    final p = month.split('-'); final dt = DateTime(int.parse(p[0]), int.parse(p[1]) + by, 1);
    final next = '${dt.year.toString().padLeft(4, '0')}-${dt.month.toString().padLeft(2, '0')}';
    if (next.compareTo(DateTime.now().toIso8601String().substring(0, 7)) > 0) return;
    setState(() => month = next);
  }

  Future<void> _leave() async {
    final reason = TextEditingController(); DateTime from = DateTime.now(), to = DateTime.now();
    final ok = await showDialog<bool>(context: context, builder: (_) => StatefulBuilder(builder: (ctx, set) => AlertDialog(title: const Text('Apply for leave'), content: Column(mainAxisSize: MainAxisSize.min, children: [
      ListTile(title: Text('From: ${from.toIso8601String().substring(0, 10)}'), onTap: () async { final x = await showDatePicker(context: ctx, initialDate: from, firstDate: DateTime.now().subtract(const Duration(days: 30)), lastDate: DateTime.now().add(const Duration(days: 365))); if (x != null) set(() { from = x; if (to.isBefore(from)) to = from; }); }),
      ListTile(title: Text('To: ${to.toIso8601String().substring(0, 10)}'), onTap: () async { final x = await showDatePicker(context: ctx, initialDate: to, firstDate: from, lastDate: DateTime.now().add(const Duration(days: 365))); if (x != null) set(() => to = x); }),
      TextField(controller: reason, decoration: const InputDecoration(labelText: 'Reason', hintText: 'For example: fever, family function'))]),
      actions: [TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')), FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Send to school'))])));
    if (ok != true || reason.text.trim().isEmpty) return;
    try {
      await Api.post('/leaves', {'studentId': model.curId, 'fromDate': from.toIso8601String().substring(0, 10), 'toDate': to.toIso8601String().substring(0, 10), 'reason': reason.text.trim()});
      _snack(context, 'Sent to the school. You will see the answer here.');
      final k = model.cur; if (k != null) await loadFor(k);
    } catch (e) { _snack(context, _err(e)); }
  }

  @override
  Widget build(BuildContext context) {
    final g = _gate(model, data: d, err: err);
    if (g != null) return g;
    final a = d!['attendance'] as Map; final months = (a['months'] as List?) ?? []; final days = (a['days'] as List?) ?? [];
    final byDay = <String, String>{for (final x in days) _ymd(x['date']): '${x['status']}'};
    final p = month.split('-'); final first = DateTime(int.parse(p[0]), int.parse(p[1]), 1); final lead = (first.weekday + 6) % 7; final n = DateTime(first.year, first.month + 1, 0).day;
    Color colourOf(String? s) => s == 'PRESENT' ? Colors.green.shade700 : s == 'ABSENT' ? Colors.red.shade700 : s == 'LATE' ? Colors.amber.shade700 : s == 'LEAVE' ? Colors.blueGrey.shade300 : Colors.grey.shade200;
    final leaves = (d!['leaves'] as List?) ?? [];
    return RefreshIndicator(onRefresh: () async { final k = model.cur; if (k != null) await loadFor(k); }, child: ListView(padding: const EdgeInsets.all(16), children: [
      _kidHeader(model),
      Row(children: [
        Stat('overall (6 months)', a['overallPct'] == null ? '—' : '${a['overallPct']}%', color: _pctColour(a['overallPct'] as num?)),
        if (months.isNotEmpty) Stat('absent this month', '${months.first['absent']}', color: (months.first['absent'] as num) > 0 ? Colors.red : Colors.green),
      ]),
      Card(child: Padding(padding: const EdgeInsets.all(12), child: Column(children: [
        Row(children: [IconButton(icon: const Icon(Icons.chevron_left), onPressed: () => _shift(-1)), Expanded(child: Text(_monthName(month), textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleMedium)), IconButton(icon: const Icon(Icons.chevron_right), onPressed: () => _shift(1))]),
        Row(children: [for (final w in ['M', 'T', 'W', 'T', 'F', 'S', 'S']) Expanded(child: Center(child: Text(w, style: const TextStyle(fontSize: 11, color: Colors.grey))))]),
        const SizedBox(height: 4),
        GridView.count(crossAxisCount: 7, shrinkWrap: true, physics: const NeverScrollableScrollPhysics(), mainAxisSpacing: 4, crossAxisSpacing: 4, children: [
          for (int i = 0; i < lead; i++) const SizedBox(),
          for (int dd = 1; dd <= n; dd++) Container(
            decoration: BoxDecoration(color: colourOf(byDay['$month-${dd.toString().padLeft(2, '0')}']), borderRadius: BorderRadius.circular(6)),
            alignment: Alignment.center, child: Text('$dd', style: TextStyle(fontSize: 12, color: byDay.containsKey('$month-${dd.toString().padLeft(2, '0')}') ? Colors.white : Colors.grey))),
        ]),
        const SizedBox(height: 8),
        Wrap(spacing: 10, children: [for (final e in {'Present': Colors.green.shade700, 'Late': Colors.amber.shade700, 'Absent': Colors.red.shade700, 'Leave': Colors.blueGrey.shade300}.entries) Row(mainAxisSize: MainAxisSize.min, children: [Icon(Icons.circle, size: 10, color: e.value), const SizedBox(width: 4), Text(e.key, style: const TextStyle(fontSize: 11))])]),
      ]))),
      if (months.isNotEmpty) Section('Month by month', [for (final m in months) ListTile(dense: true, contentPadding: EdgeInsets.zero, title: Text(_monthName('${m['month']}')), subtitle: Text('${m['present']} present · ${m['late']} late · ${m['absent']} absent · ${m['leave']} leave'), trailing: Text(m['pct'] == null ? '—' : '${m['pct']}%', style: TextStyle(fontWeight: FontWeight.bold, color: _pctColour(m['pct'] as num?))))]),
      FilledButton.icon(onPressed: _leave, icon: const Icon(Icons.event_busy), label: const Text('Apply for leave')),
      const SizedBox(height: 8),
      for (final l in leaves) Card(child: ListTile(title: Text('${l['fromDate']} → ${l['toDate']}'), subtitle: Text('${l['reason']}${l['note'] != null ? '\n${l['note']}' : ''}'), trailing: Chip(label: Text('${l['status']}'), backgroundColor: l['status'] == 'approved' ? Colors.green.shade100 : l['status'] == 'rejected' ? Colors.red.shade100 : null))),
    ]));
  }
}

// ---------------------------------------------------------------------------------------------------- Homework and study
class HomeworkPage extends StatefulWidget {
  final ParentModel model;
  const HomeworkPage(this.model, {super.key});
  @override State<HomeworkPage> createState() => _HomeworkState();
}
class _HomeworkState extends ChildState<HomeworkPage> {
  @override ParentModel get model => widget.model;
  Map? d; String? err; List hw = [], study = [], lessons = [];

  @override
  Future<void> loadFor(Map kid) async {
    if (mounted) setState(() { d = null; err = null; });
    try {
      final r = await Api.get('/parent/child/${kid['id']}');
      try { hw = await Api.get('/homework'); } catch (_) { hw = []; }
      try { study = await Api.get('/content'); } catch (_) { study = []; }
      try { lessons = await Api.get('/records/mine/all?kind=lesson'); } catch (_) { lessons = []; }
      if (!mounted || model.curId != kid['id']) return;
      setState(() => d = Map<String, dynamic>.from(r as Map));
    } catch (e) { if (mounted) setState(() => err = _err(e)); }
  }

  @override
  Widget build(BuildContext context) {
    final g = _gate(model, data: d, err: err);
    if (g != null) return g;
    final prof = d!['profile'] as Map; final batch = prof['batchId']; final id = model.curId; final now = DateTime.now();
    final mine = hw.where((h) => h['batchId'] == batch).map((h) {
      final subs = ((h['submissions'] as List?) ?? []).where((s) => s['studentId'] == id).toList();
      final sub = subs.isEmpty ? null : subs.first as Map;
      final due = DateTime.tryParse('${h['dueAt']}')?.toLocal();
      return {'h': h, 'sub': sub, 'status': sub != null ? 'done' : (due != null && due.isBefore(now) ? 'overdue' : 'pending')};
    }).toList();
    final open = mine.where((x) => x['status'] != 'done').toList()..sort((a, b) => '${(a['h'] as Map)['dueAt']}'.compareTo('${(b['h'] as Map)['dueAt']}'));
    final done = mine.where((x) => x['status'] == 'done').take(10).toList();
    final mat = study.where((c) => c['batchId'] == null || c['batchId'] == batch).take(30).toList();
    final diary = lessons.where((r) => r['studentId'] == null || r['studentId'] == id).take(8).toList();
    return RefreshIndicator(onRefresh: () async { final k = model.cur; if (k != null) await loadFor(k); }, child: ListView(padding: const EdgeInsets.all(16), children: [
      _kidHeader(model),
      Section('To do (${open.length})', open.isEmpty ? [_empty('Nothing pending. All homework is handed in.')] : [for (final x in open) Card(child: ListTile(
        title: Text('${(x['h'] as Map)['title']}'), isThreeLine: (x['h'] as Map)['description'] != null,
        subtitle: Text('${(x['h'] as Map)['subject'] ?? ''} · due ${day('${(x['h'] as Map)['dueAt']}')}${(x['h'] as Map)['description'] != null ? '\n${(x['h'] as Map)['description']}' : ''}'),
        trailing: x['status'] == 'overdue' ? const Chip(label: Text('Overdue'), backgroundColor: Color(0xFFFFCDD2)) : const Chip(label: Text('Pending'))))]),
      if (done.isNotEmpty) Section('Handed in', [for (final x in done) Card(child: ListTile(
        title: Text('${(x['h'] as Map)['title']}'), subtitle: Text('${(x['h'] as Map)['subject'] ?? ''}${(x['sub'] as Map?)?['remark'] != null ? '\nTeacher: ${(x['sub'] as Map)['remark']}' : ''}'),
        trailing: Chip(label: Text((x['sub'] as Map?)?['checkedAt'] != null ? ((x['sub'] as Map)['grade'] != null ? 'Checked · ${(x['sub'] as Map)['grade']}' : 'Checked') : 'Waiting for teacher'))))]),
      Section('What was taught recently', diary.isEmpty ? [_empty('The teachers have not added a lesson diary yet.')] : [for (final r in diary) ListTile(dense: true, contentPadding: EdgeInsets.zero, title: Text('${r['title']}'), subtitle: Text([(r['data'] as Map?)?['subject'], day('${r['date']}'), (r['data'] as Map?)?['details'], (r['data'] as Map?)?['homework'] == null ? null : 'Homework: ${(r['data'] as Map)['homework']}'].where((x) => x != null && x.toString().isNotEmpty).join(' · ')))]),
      Section('Study material', mat.isEmpty ? [_empty('No study material has been shared yet.')] : [for (final c in mat) ListTile(dense: true, contentPadding: EdgeInsets.zero, title: Text('${c['title']}'), subtitle: Text('${c['subject']}${c['chapter'] != null ? ' · ${c['chapter']}' : ''}'),
        trailing: c['url'] != null ? IconButton(icon: const Icon(Icons.open_in_new), onPressed: () => openUrl('${c['url']}')) : null)]),
    ]));
  }
}

// ------------------------------------------------------------------------------------------------------------------ Fees
class FeesPage extends StatefulWidget {
  final ParentModel model;
  const FeesPage(this.model, {super.key});
  @override State<FeesPage> createState() => _FeesState();
}
class _FeesState extends ChildState<FeesPage> {
  @override ParentModel get model => widget.model;
  Map? d; String? err;

  @override
  Future<void> loadFor(Map kid) async {
    if (mounted) setState(() { d = null; err = null; });
    try {
      final r = await Api.get('/parent/child/${kid['id']}');
      if (!mounted || model.curId != kid['id']) return;
      setState(() => d = Map<String, dynamic>.from(r as Map));
    } catch (e) { if (mounted) setState(() => err = _err(e)); }
  }

  @override
  Widget build(BuildContext context) {
    final g = _gate(model, data: d, err: err);
    if (g != null) return g;
    final f = d!['fees'] as Map?; final receipts = (d!['receipts'] as List?) ?? [];
    final bal = f == null ? 0 : (f['balance'] as num);
    return RefreshIndicator(onRefresh: () async { final k = model.cur; if (k != null) await loadFor(k); }, child: ListView(padding: const EdgeInsets.all(16), children: [
      _kidHeader(model),
      if (f == null) _empty('No fee plan has been set for this student yet.') else ...[
        Text('${f['plan']}${(f['cycle'] ?? '').toString().isEmpty ? '' : ' · ${f['cycle']}'}', style: Theme.of(context).textTheme.titleMedium),
        Row(children: [Stat('due so far', _inr(f['due'] as num)), Stat('paid', _inr(f['paid'] as num), color: Colors.green), Stat('balance', bal > 0 ? _inr(bal) : 'All clear ✓', color: bal > 0 ? Colors.red : Colors.green)]),
        if (bal > 0) FilledButton.icon(icon: const Icon(Icons.currency_rupee), label: Text('Pay ${_inr(bal)} online'), onPressed: () => _payNow(context, model.curId!, bal)),
        if (bal > 0) const Padding(padding: EdgeInsets.only(top: 4), child: Text('or pay at the school office', style: TextStyle(color: Colors.grey))),
      ],
      const SizedBox(height: 12),
      Section('Payments and receipts', receipts.isEmpty ? [_empty('No payment has been recorded yet.')] : [for (final r in receipts) Card(child: ListTile(
        title: Text('${_inr(r['amount'] as num)} · ${r['mode']}'), subtitle: Text('${day('${r['paidOn']}')} ${_ymd(r['paidOn']).substring(0, 4)} · ${r['receiptNo'] ?? ''}'),
        trailing: IconButton(icon: const Icon(Icons.picture_as_pdf), onPressed: () => openPdf(context, '/fees/receipt/${r['id']}.pdf'))))]),
    ]));
  }
}

// ----------------------------------------------------------------------------------------------------------- Timetable
class TimetablePage extends StatefulWidget {
  final ParentModel model;
  const TimetablePage(this.model, {super.key});
  @override State<TimetablePage> createState() => _TimetableState();
}
class _TimetableState extends ChildState<TimetablePage> {
  @override ParentModel get model => widget.model;
  Map? d; String? err;

  @override
  Future<void> loadFor(Map kid) async {
    if (mounted) setState(() { d = null; err = null; });
    try {
      final r = await Api.get('/parent/child/${kid['id']}');
      if (!mounted || model.curId != kid['id']) return;
      setState(() => d = Map<String, dynamic>.from(r as Map));
    } catch (e) { if (mounted) setState(() => err = _err(e)); }
  }

  @override
  Widget build(BuildContext context) {
    final g = _gate(model, data: d, err: err);
    if (g != null) return g;
    final week = (d!['week'] as List?) ?? []; final wd = DateTime.now().weekday % 7;
    if (!week.any((w) => (w['periods'] as List).isNotEmpty)) return ListView(padding: const EdgeInsets.all(16), children: [_kidHeader(model), _empty('The school has not published a timetable for this class yet.')]);
    return ListView(padding: const EdgeInsets.all(16), children: [
      _kidHeader(model),
      for (final w in week) Card(
        shape: w['weekday'] == wd ? RoundedRectangleBorder(borderRadius: BorderRadius.circular(12), side: BorderSide(color: Theme.of(context).colorScheme.primary, width: 2)) : null,
        child: Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('${w['name']}${w['weekday'] == wd ? '  (today)' : ''}', style: Theme.of(context).textTheme.titleSmall),
          if ((w['periods'] as List).isEmpty) _empty('No classes.'),
          for (final p in (w['periods'] as List)) ListTile(dense: true, contentPadding: EdgeInsets.zero, leading: Text('${p['start']}–${p['end']}', style: const TextStyle(fontSize: 12)), title: Text('${p['subject']}'), subtitle: Text([p['teacher'], p['room']].where((x) => x != null && x.toString().isNotEmpty).join(' · '))),
        ]))),
    ]);
  }
}

// ------------------------------------------------------------------------------------------------- Notices and events
class NoticesPage extends StatefulWidget {
  final ParentModel model;
  const NoticesPage(this.model, {super.key});
  @override State<NoticesPage> createState() => _NoticesState();
}
class _NoticesState extends ChildState<NoticesPage> {
  @override ParentModel get model => widget.model;
  List notices = [], ptm = [], events = [], holidays = []; bool ready = false; String? open;

  @override
  Future<void> loadFor(Map kid) async {
    try { notices = await Api.get('/notices'); } catch (_) {}
    try { ptm = await Api.get('/records/mine/all?kind=ptm-slot'); } catch (_) {}
    try { events = await Api.get('/records/mine/all?kind=event'); } catch (_) {}
    try { holidays = await Api.get('/records/mine/all?kind=holiday'); } catch (_) {}
    if (mounted) setState(() => ready = true);
  }

  Future<void> _book(Map s) async {
    try { await Api.post('/records/ptm/${s['id']}/book', {'studentId': model.curId}); _snack(context, 'Booked. The teacher has been told.'); }
    catch (e) { _snack(context, _err(e)); }
    final k = model.cur; if (k != null) await loadFor(k);
  }

  @override
  Widget build(BuildContext context) {
    final g = _gate(model, data: ready ? true : null);
    if (g != null) return g;
    final today = DateTime.now().toIso8601String().substring(0, 10); final id = model.curId;
    final openSlots = ptm.where((s) => s['status'] == 'open' && (s['date'] == null || _ymd(s['date']).compareTo(today) >= 0)).toList();
    final booked = ptm.where((s) => s['status'] == 'booked' && s['studentId'] == id && (s['date'] == null || _ymd(s['date']).compareTo(today) >= 0)).toList();
    List upcoming(List rows) => rows.where((r) => (r['studentId'] == null || r['studentId'] == id) && (r['date'] == null || _ymd(r['date']).compareTo(today) >= 0)).toList()..sort((a, b) => _ymd(a['date']).compareTo(_ymd(b['date'])));
    return RefreshIndicator(onRefresh: () async { final k = model.cur; if (k != null) await loadFor(k); }, child: ListView(padding: const EdgeInsets.all(16), children: [
      _kidHeader(model),
      Section('Notices', notices.isEmpty ? [_empty('No notices yet.')] : [for (final n in notices.take(40)) NoticeTile(n as Map, onOpen: () async {
        setState(() => open = open == n['id'] ? null : '${n['id']}');
        if (n['read'] != true) { try { await Api.post('/notices/${n['id']}/read', {}); } catch (_) {} final k = model.cur; if (k != null) await loadFor(k); }
        if (mounted && open == n['id']) { showDialog(context: context, builder: (_) => AlertDialog(title: Text('${n['title']}'), content: SingleChildScrollView(child: Text('${n['body']}')), actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('Close'))])); }
      })]),
      if (openSlots.isNotEmpty || booked.isNotEmpty) Section('Parent–teacher meeting', [
        for (final s in booked) ListTile(dense: true, contentPadding: EdgeInsets.zero, leading: const Icon(Icons.check_circle, color: Colors.green), title: Text('Booked: ${day('${s['date']}')} ${(s['data'] as Map?)?['time'] ?? ''}'), subtitle: Text('with ${s['staffName'] ?? 'the teacher'}${(s['data'] as Map?)?['venue'] != null && '${(s['data'] as Map)['venue']}'.isNotEmpty ? ' · ${(s['data'] as Map)['venue']}' : ''}')),
        for (final s in openSlots.take(12)) ListTile(dense: true, contentPadding: EdgeInsets.zero, title: Text('${s['staffName'] ?? s['title']}'), subtitle: Text('${day('${s['date']}')} · ${(s['data'] as Map?)?['time'] ?? ''}${(s['data'] as Map?)?['venue'] != null && '${(s['data'] as Map)['venue']}'.isNotEmpty ? ' · ${(s['data'] as Map)['venue']}' : ''}'), trailing: FilledButton(onPressed: () => _book(s as Map), child: const Text('Book'))),
      ]),
      Section('Events', upcoming(events).isEmpty ? [_empty('No events are planned right now.')] : [for (final r in upcoming(events).take(10)) ListTile(dense: true, contentPadding: EdgeInsets.zero, title: Text('${r['title']}'), subtitle: Text([day('${r['date']}'), (r['data'] as Map?)?['time'], (r['data'] as Map?)?['venue'], (r['data'] as Map?)?['details']].where((x) => x != null && x.toString().isNotEmpty).join(' · ')))]),
      if (upcoming(holidays).isNotEmpty) Section('Holidays and school calendar', [for (final r in upcoming(holidays).take(12)) ListTile(dense: true, contentPadding: EdgeInsets.zero, title: Text('${r['title']}'), subtitle: Text('${day('${r['date']}')} · ${r['status'] ?? ''}'))]),
    ]));
  }
}

// ------------------------------------------------------------------------------------------------------------------ More
class MorePage extends StatelessWidget {
  final ParentModel model;
  const MorePage(this.model, {super.key});

  void _open(BuildContext context, String title, Widget Function() body) {
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => Scaffold(appBar: AppBar(title: Text(title)), body: body())));
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(listenable: model, builder: (_, __) {
      final g = _gate(model, data: true);
      if (g != null) return g;
      final id = model.curId;
      return ListView(padding: const EdgeInsets.all(8), children: [
        Padding(padding: const EdgeInsets.fromLTRB(8, 8, 8, 0), child: KidPicker(model)),
        ListTile(leading: const Icon(Icons.calendar_view_week), title: const Text('Timetable'), subtitle: const Text('The weekly class schedule'), onTap: () => _open(context, 'Timetable', () => TimetablePage(model))),
        ListTile(leading: const Icon(Icons.campaign_outlined), title: Text(model.unread > 0 ? 'Notices & events (${model.unread} new)' : 'Notices & events'), subtitle: const Text('Circulars, holidays, events, parent–teacher meetings'), onTap: () => _open(context, 'Notices & events', () => NoticesPage(model))),
        ListTile(leading: const Icon(Icons.school_outlined), title: const Text('Teachers & school'), subtitle: const Text('Teachers, achievements, school notes, rate a teacher, requests'), onTap: () => _open(context, 'Teachers & school', () => SchoolScreen(studentId: id))),
        ListTile(leading: const Icon(Icons.quiz_outlined), title: const Text('Online tests'), subtitle: const Text('Tests and results'), onTap: () { if (id != null) { _open(context, 'Online tests', () => TestsScreen(studentId: id, canAttempt: false)); } }),
        ListTile(leading: const Icon(Icons.newspaper), title: const Text('News'), onTap: () => _open(context, 'News', () => const NewsScreen())),
        ListTile(leading: const Icon(Icons.chat_bubble_outline), title: const Text('Messages'), onTap: () => _open(context, 'Messages', () => const ChatScreen())),
      ]);
    });
  }
}

// ----------------------------------------------------------------------------------------------------------- The shell
/// The bottom-bar shell of the parent app. Keeps the children list in one place and passes it to every screen.
class ParentPortal extends StatefulWidget {
  const ParentPortal({super.key});
  @override State<ParentPortal> createState() => _ParentPortalState();
}
class _ParentPortalState extends State<ParentPortal> {
  final model = ParentModel();
  int tab = 0;
  final Set<int> seen = {0};

  @override
  void initState() { super.initState(); model.load(); }
  @override
  void dispose() { model.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    final pages = <Widget>[
      TodayPage(model, (i) => setState(() { tab = i; seen.add(i); })),
      ProgressPage(model),
      AttendancePage(model),
      HomeworkPage(model),
      FeesPage(model),
      MorePage(model),
    ];
    return Column(children: [
      Expanded(child: IndexedStack(index: tab, children: [for (int i = 0; i < pages.length; i++) seen.contains(i) ? pages[i] : const SizedBox()])),
      NavigationBar(selectedIndex: tab, labelBehavior: NavigationDestinationLabelBehavior.alwaysShow, onDestinationSelected: (i) => setState(() { tab = i; seen.add(i); }), destinations: const [
        NavigationDestination(icon: Icon(Icons.family_restroom), label: 'Today'),
        NavigationDestination(icon: Icon(Icons.trending_up), label: 'Progress'),
        NavigationDestination(icon: Icon(Icons.event_available), label: 'Attendance'),
        NavigationDestination(icon: Icon(Icons.assignment_outlined), label: 'Homework'),
        NavigationDestination(icon: Icon(Icons.currency_rupee), label: 'Fees'),
        NavigationDestination(icon: Icon(Icons.more_horiz), label: 'More'),
      ]),
    ]);
  }
}
