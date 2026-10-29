import 'package:flutter/material.dart';
import '../api.dart';
import '../widgets.dart';

/// "School" tab for students and parents: exam results + report card, calendar, lesson diary, achievements, events, gallery,
/// parent–teacher meetings (book a slot), transport, discipline, health, library, certificates, fines, service requests, rate a teacher.
class SchoolScreen extends StatefulWidget {
  final String? studentId;
  const SchoolScreen({this.studentId, super.key});
  @override State<SchoolScreen> createState() => _S();
}

class _S extends State<SchoolScreen> {
  List rows = [];
  List exams = [];
  bool busy = true;

  static const sections = [
    ['holiday', 'Calendar & holidays', Icons.calendar_month],
    ['lesson', 'What was taught', Icons.menu_book],
    ['ptm-slot', 'Parent–teacher meetings', Icons.groups],
    ['achievement', 'Achievements', Icons.emoji_events],
    ['event', 'Events', Icons.celebration],
    ['gallery', 'Photos & videos', Icons.photo_library],
    ['transport-assign', 'Transport', Icons.directions_bus],
    ['discipline', 'Discipline', Icons.gavel],
    ['health', 'Health', Icons.medical_services],
    ['loan', 'Library books', Icons.local_library],
    ['certificate', 'Certificates', Icons.workspace_premium],
    ['fee-fine', 'Fines', Icons.receipt_long],
    ['service-request', 'My requests', Icons.support],
  ];

  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    try { rows = await Api.get('/records/mine/all'); } catch (_) {}
    try {
      exams = widget.studentId == null ? [] : await Api.get('/exams/mine?studentId=${widget.studentId}');
    } catch (_) { exams = []; }
    if (mounted) setState(() => busy = false);
  }

  List of(String k) => rows.where((r) => r['kind'] == k && (widget.studentId == null || r['studentId'] == null || r['studentId'] == widget.studentId)).toList();

  void snack(String m) {
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));
  }

  Future<void> request() async {
    String type = 'Certificate';
    final t = TextEditingController();
    final d = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => StatefulBuilder(
        builder: (ctx, set) => AlertDialog(
          title: const Text('New request to the office'),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            DropdownButtonFormField<String>(
              value: type,
              items: ['Certificate', 'Fee / receipt', 'Transport', 'Maintenance', 'Document', 'Other'].map((x) => DropdownMenuItem(value: x, child: Text(x))).toList(),
              onChanged: (v) => set(() => type = v!),
              decoration: const InputDecoration(labelText: 'Type'),
            ),
            TextField(controller: t, decoration: const InputDecoration(labelText: 'Request')),
            TextField(controller: d, maxLines: 3, decoration: const InputDecoration(labelText: 'Details')),
          ]),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Send')),
          ],
        ),
      ),
    );
    if (ok != true || t.text.trim().isEmpty) return;
    await Api.post('/records/request', {'title': t.text.trim(), 'studentId': widget.studentId, 'data': {'type': type, 'details': d.text.trim()}});
    load();
    snack('Request sent to the office');
  }

  Future<void> rateTeacher() async {
    List teachers = [];
    try { teachers = await Api.get('/records/my-teachers?studentId=${widget.studentId ?? ''}'); } catch (_) {}
    if (teachers.isEmpty) { snack('No teachers are listed for this class yet'); return; }
    if (!mounted) return;
    String tid = teachers.first['id'] as String;
    int rating = 5;
    final c = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => StatefulBuilder(
        builder: (ctx, set) => AlertDialog(
          title: const Text('Rate a teacher'),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            DropdownButtonFormField<String>(
              value: tid,
              items: teachers.map<DropdownMenuItem<String>>((t) {
                final sub = (t['subject'] ?? '').toString();
                return DropdownMenuItem<String>(value: t['id'] as String, child: Text(sub.isEmpty ? '${t['name']}' : '${t['name']} · $sub'));
              }).toList(),
              onChanged: (v) => set(() => tid = v!),
              decoration: const InputDecoration(labelText: 'Teacher'),
            ),
            const SizedBox(height: 8),
            Row(mainAxisAlignment: MainAxisAlignment.center, children: List.generate(5, (i) => IconButton(icon: Icon(i < rating ? Icons.star : Icons.star_border, color: Colors.amber, size: 32), onPressed: () => set(() => rating = i + 1)))),
            TextField(controller: c, maxLines: 3, decoration: const InputDecoration(labelText: 'Comment (optional) — your name is not shown')),
          ]),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Send')),
          ],
        ),
      ),
    );
    if (ok != true) return;
    final t = teachers.firstWhere((x) => x['id'] == tid);
    try {
      await Api.post('/records/feedback/teacher-feedback', {'staffId': tid, 'studentId': widget.studentId, 'rating': rating, 'comment': c.text.trim(), 'subject': (t['subject'] ?? '').toString()});
      snack('Thank you for your feedback');
    } catch (e) { snack(e.toString().replaceFirst('Exception: ', '')); }
  }

  Future<void> book(Map r) async {
    try {
      await Api.post('/records/ptm/${r['id']}/book', {'studentId': widget.studentId});
      snack('Meeting booked');
      load();
    } catch (e) { snack(e.toString().replaceFirst('Exception: ', '')); }
  }

  String _sub(Map r) {
    final d = (r['data'] as Map?) ?? {};
    final parts = <String>[
      if (r['date'] != null) day(r['date']),
      if (d['endDate'] != null) 'to ${day(d['endDate'])}',
      if (r['refTitle'] != null) r['refTitle'].toString(),
      if (r['staffName'] != null) r['staffName'].toString(),
      ...['subject', 'teacher', 'category', 'type', 'area', 'level', 'position', 'venue', 'time', 'pickupTime', 'dueDate', 'details', 'description', 'homework', 'action', 'treatment', 'resolution', 'serial', 'amount'].where((k) => d[k] != null && d[k].toString().isNotEmpty).map((k) => k == 'homework' ? 'HW: ${d[k]}' : k == 'dueDate' ? 'Due ${day(d[k])}' : k == 'amount' ? 'Rs ${d[k]}' : d[k].toString()),
    ];
    return parts.join(' · ');
  }

  Widget trailingFor(Map r) {
    final d = (r['data'] as Map?) ?? {};
    if (r['kind'] == 'certificate') return IconButton(icon: const Icon(Icons.picture_as_pdf), onPressed: () => openPdf(context, '/certificates/${r['id']}.pdf'));
    if (r['kind'] == 'ptm-slot') {
      return r['status'] == 'open' ? FilledButton.tonal(onPressed: () => book(r), child: const Text('Book')) : const Chip(label: Text('Booked', style: TextStyle(fontSize: 11)));
    }
    final link = d['url'] ?? d['certificateUrl'];
    if (link != null && link.toString().isNotEmpty) return IconButton(icon: const Icon(Icons.open_in_new), onPressed: () => openUrl(link.toString()));
    return Chip(label: Text(r['status'].toString(), style: const TextStyle(fontSize: 11)));
  }

  @override
  Widget build(BuildContext context) {
    if (busy) return const Center(child: CircularProgressIndicator());
    return RefreshIndicator(
      onRefresh: load,
      child: ListView(padding: const EdgeInsets.all(12), children: [
        Wrap(spacing: 8, children: [
          FilledButton.tonalIcon(onPressed: rateTeacher, icon: const Icon(Icons.star_rate), label: const Text('Rate a teacher')),
          FilledButton.tonalIcon(onPressed: request, icon: const Icon(Icons.add), label: const Text('Request to office')),
        ]),
        const SizedBox(height: 8),
        if (exams.isNotEmpty)
          ExpansionTile(
            leading: const Icon(Icons.grading),
            title: const Text('Exam results'),
            subtitle: Text('${exams.length} published'),
            initiallyExpanded: true,
            children: [
              for (final e in exams)
                ExpansionTile(
                  title: Text('${e['examName']} · ${e['pct']}% · ${e['grade']}'),
                  subtitle: Text('${e['term']} · ${e['total']}/${e['maxTotal']}${e['rank'] != null ? ' · Rank ${e['rank']} of ${e['of']}' : ''}'),
                  children: [
                    for (final s in (e['subjects'] as List))
                      ListTile(dense: true, title: Text(s['name'].toString()), trailing: Text(s['absent'] == true ? 'Absent' : '${s['marks'] ?? '-'} / ${s['max']}  ${s['grade'] ?? ''}')),
                    Align(
                      alignment: Alignment.centerLeft,
                      child: TextButton.icon(
                        onPressed: widget.studentId == null ? null : () => openPdf(context, '/exams/report-card/${widget.studentId}.pdf?term=${Uri.encodeComponent(e['term'].toString())}'),
                        icon: const Icon(Icons.picture_as_pdf),
                        label: const Text('Report card (PDF)'),
                      ),
                    ),
                  ],
                ),
            ],
          ),
        for (final s in sections)
          if (of(s[0] as String).isNotEmpty || s[0] == 'service-request')
            ExpansionTile(
              leading: Icon(s[2] as IconData),
              title: Text(s[1] as String),
              subtitle: Text('${of(s[0] as String).length} item(s)'),
              initiallyExpanded: s[0] == 'holiday' || s[0] == 'lesson' || s[0] == 'ptm-slot',
              children: [
                for (final r in of(s[0] as String))
                  ListTile(title: Text(r['title'].toString()), subtitle: Text(_sub(r), maxLines: 3, overflow: TextOverflow.ellipsis), trailing: trailingFor(r), isThreeLine: true),
              ],
            ),
        if (rows.isEmpty && exams.isEmpty) const Padding(padding: EdgeInsets.all(24), child: Text('Nothing shared by the school yet.', textAlign: TextAlign.center)),
      ]),
    );
  }
}

/// Staff: my duties and tasks.
class DutiesScreen extends StatefulWidget {
  const DutiesScreen({super.key});
  @override State<DutiesScreen> createState() => _D();
}

class _D extends State<DutiesScreen> {
  List rows = [];
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    try { rows = await Api.get('/records/mine/duties'); } catch (_) {}
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) => RefreshIndicator(
        onRefresh: load,
        child: ListView(padding: const EdgeInsets.all(12), children: [
          if (rows.isEmpty) const Padding(padding: EdgeInsets.all(24), child: Text('No duties assigned.', textAlign: TextAlign.center)),
          for (final r in rows)
            Card(
              child: ListTile(
                title: Text(r['title'].toString()),
                subtitle: Text([if (r['data']?['dueDate'] != null) 'Due ${day(r['data']['dueDate'])}', if (r['data']?['priority'] != null) r['data']['priority'].toString(), if (r['data']?['details'] != null) r['data']['details'].toString()].join(' · ')),
                trailing: r['status'] == 'done'
                    ? const Icon(Icons.check_circle, color: Colors.green)
                    : TextButton(onPressed: () async { await Api.put('/records/duty/${r['id']}', {'status': 'done'}); load(); }, child: const Text('Done')),
              ),
            ),
        ]),
      );
}

/// Staff: apply for leave, publish PTM slots, see my leave and payslips.
class StaffHrScreen extends StatefulWidget {
  const StaffHrScreen({super.key});
  @override State<StaffHrScreen> createState() => _H();
}

class _H extends State<StaffHrScreen> {
  List leaves = [];
  List slips = [];
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    try { leaves = await Api.get('/records/mine/leaves'); } catch (_) {}
    try { slips = await Api.get('/payroll/mine'); } catch (_) {}
    if (mounted) setState(() {});
  }

  void snack(String m) {
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));
  }

  Future<void> applyLeave() async {
    String from = DateTime.now().toIso8601String().substring(0, 10);
    String to = from;
    String type = 'Casual';
    final reason = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => StatefulBuilder(
        builder: (ctx, set) => AlertDialog(
          title: const Text('Apply for leave'),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            ListTile(contentPadding: EdgeInsets.zero, title: const Text('From'), subtitle: Text(from), trailing: const Icon(Icons.calendar_today), onTap: () async { final d = await pickDate(ctx); if (d != null) set(() { from = d; if (to.compareTo(from) < 0) to = from; }); }),
            ListTile(contentPadding: EdgeInsets.zero, title: const Text('To'), subtitle: Text(to), trailing: const Icon(Icons.calendar_today), onTap: () async { final d = await pickDate(ctx); if (d != null) set(() => to = d.compareTo(from) < 0 ? from : d); }),
            DropdownButtonFormField<String>(value: type, items: ['Casual', 'Sick', 'Earned', 'Maternity', 'Unpaid', 'Other'].map((x) => DropdownMenuItem(value: x, child: Text(x))).toList(), onChanged: (v) => set(() => type = v!), decoration: const InputDecoration(labelText: 'Type')),
            TextField(controller: reason, maxLines: 2, decoration: const InputDecoration(labelText: 'Reason')),
          ]),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Apply')),
          ],
        ),
      ),
    );
    if (ok != true || reason.text.trim().isEmpty) return;
    try {
      await Api.post('/records/my-leave', {'fromDate': from, 'toDate': to, 'type': type, 'reason': reason.text.trim()});
      snack('Leave request sent to the principal');
      load();
    } catch (e) { snack(e.toString().replaceFirst('Exception: ', '')); }
  }

  Future<void> publishSlots() async {
    String date = DateTime.now().add(const Duration(days: 7)).toIso8601String().substring(0, 10);
    final times = TextEditingController(text: '10:00, 10:10, 10:20, 10:30');
    final venue = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => StatefulBuilder(
        builder: (ctx, set) => AlertDialog(
          title: const Text('Publish PTM slots'),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            ListTile(contentPadding: EdgeInsets.zero, title: const Text('Date'), subtitle: Text(date), trailing: const Icon(Icons.calendar_today), onTap: () async { final d = await pickDate(ctx, pastDays: 0); if (d != null) set(() => date = d); }),
            TextField(controller: times, decoration: const InputDecoration(labelText: 'Times (comma separated)')),
            TextField(controller: venue, decoration: const InputDecoration(labelText: 'Room / venue')),
          ]),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Publish')),
          ],
        ),
      ),
    );
    if (ok != true) return;
    try {
      final r = await Api.post('/records/my-ptm-slots', {'date': date, 'times': times.text.split(',').map((x) => x.trim()).where((x) => x.isNotEmpty).toList(), 'venue': venue.text.trim()});
      snack('${r['created']} slots published — parents can book from the app');
    } catch (e) { snack(e.toString().replaceFirst('Exception: ', '')); }
  }

  @override
  Widget build(BuildContext context) => RefreshIndicator(
        onRefresh: load,
        child: ListView(padding: const EdgeInsets.all(12), children: [
          Wrap(spacing: 8, children: [
            FilledButton.icon(onPressed: applyLeave, icon: const Icon(Icons.event_busy), label: const Text('Apply for leave')),
            FilledButton.tonalIcon(onPressed: publishSlots, icon: const Icon(Icons.groups), label: const Text('Publish PTM slots')),
          ]),
          const SizedBox(height: 12),
          Section('My leave', [
            if (leaves.isEmpty) const Text('No leave applied yet.'),
            for (final l in leaves)
              Card(child: ListTile(title: Text(l['title'].toString()), subtitle: Text('${day(l['date'])}${l['data']?['toDate'] != null && l['data']['toDate'] != l['date'] ? ' to ${day(l['data']['toDate'])}' : ''} · ${l['data']?['type'] ?? ''}'), trailing: Chip(label: Text(l['status'].toString(), style: const TextStyle(fontSize: 11))))),
          ]),
          Section('My payslips', [
            if (slips.isEmpty) const Text('Payslips appear here once the school pays your salary.'),
            for (final p in slips)
              Card(child: ListTile(title: Text(p['title'].toString()), subtitle: Text('Net pay Rs ${p['data']?['net'] ?? ''} · paid ${p['data']?['paidOn'] ?? ''}'), trailing: IconButton(icon: const Icon(Icons.picture_as_pdf), onPressed: () => openPdf(context, '/payroll/${p['id']}.pdf')))),
          ]),
        ]),
      );
}
