import 'package:flutter/material.dart';
import '../api.dart';
import '../widgets.dart';

/// "School" tab for students and parents: calendar, lesson diary, achievements, discipline, health, transport, events, gallery, service requests.
class SchoolScreen extends StatefulWidget {
  final String? studentId;
  const SchoolScreen({this.studentId, super.key});
  @override State<SchoolScreen> createState() => _S();
}
class _S extends State<SchoolScreen> {
  List rows = []; bool busy = true;
  static const sections = [
    ['holiday', 'Calendar & holidays', Icons.calendar_month], ['lesson', 'What was taught', Icons.menu_book], ['achievement', 'Achievements', Icons.emoji_events], ['event', 'Events', Icons.celebration], ['gallery', 'Photos & videos', Icons.photo_library],
    ['transport-assign', 'Transport', Icons.directions_bus], ['discipline', 'Discipline', Icons.gavel], ['health', 'Health', Icons.medical_services], ['loan', 'Library books', Icons.local_library], ['service-request', 'My requests', Icons.support],
  ];
  @override void initState() { super.initState(); load(); }
  Future<void> load() async { try { rows = await Api.get('/records/mine/all'); } catch (_) {} if (mounted) setState(() => busy = false); }
  List of(String k) => rows.where((r) => r['kind'] == k && (widget.studentId == null || r['studentId'] == null || r['studentId'] == widget.studentId)).toList();

  Future<void> request() async {
    String type = 'Certificate'; final t = TextEditingController(), d = TextEditingController();
    final ok = await showDialog<bool>(context: context, builder: (_) => StatefulBuilder(builder: (ctx, set) => AlertDialog(title: const Text('New request to the office'), content: Column(mainAxisSize: MainAxisSize.min, children: [
      DropdownButtonFormField<String>(initialValue: type, items: ['Certificate', 'Fee / receipt', 'Transport', 'Maintenance', 'Document', 'Other'].map((x) => DropdownMenuItem(value: x, child: Text(x))).toList(), onChanged: (v) => set(() => type = v!), decoration: const InputDecoration(labelText: 'Type')),
      TextField(controller: t, decoration: const InputDecoration(labelText: 'Request')), TextField(controller: d, maxLines: 3, decoration: const InputDecoration(labelText: 'Details')),
    ]), actions: [TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')), FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Send'))])));
    if (ok != true || t.text.trim().isEmpty) return;
    await Api.post('/records/request', {'title': t.text.trim(), 'studentId': widget.studentId, 'data': {'type': type, 'details': d.text.trim()}}); load();
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Request sent to the office')));
  }

  @override
  Widget build(BuildContext context) {
    if (busy) return const Center(child: CircularProgressIndicator());
    return RefreshIndicator(onRefresh: load, child: ListView(padding: const EdgeInsets.all(12), children: [
      for (final s in sections) ...[
        if (of(s[0] as String).isNotEmpty || s[0] == 'service-request') ExpansionTile(leading: Icon(s[2] as IconData), title: Text(s[1] as String), subtitle: Text('${of(s[0] as String).length} item(s)'), initiallyExpanded: s[0] == 'holiday' || s[0] == 'lesson',
          children: [
            if (s[0] == 'service-request') Padding(padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4), child: Align(alignment: Alignment.centerLeft, child: FilledButton.tonalIcon(onPressed: request, icon: const Icon(Icons.add), label: const Text('New request')))),
            for (final r in of(s[0] as String)) ListTile(
              title: Text(r['title']), subtitle: Text(_sub(r), maxLines: 3, overflow: TextOverflow.ellipsis),
              trailing: r['data']?['url'] != null || r['data']?['certificateUrl'] != null ? IconButton(icon: const Icon(Icons.open_in_new), onPressed: () => openUrl(r['data']['url'] ?? r['data']['certificateUrl'])) : Chip(label: Text(r['status'], style: const TextStyle(fontSize: 11))),
              isThreeLine: true),
          ]),
      ],
      if (rows.isEmpty) const Padding(padding: EdgeInsets.all(24), child: Text('Nothing shared by the centre yet.', textAlign: TextAlign.center)),
    ]));
  }
  String _sub(Map r) { final d = r['data'] as Map? ?? {}; final parts = <String>[if (r['date'] != null) day(r['date']), if (d['endDate'] != null) 'to ${day(d['endDate'])}', if (r['refTitle'] != null) r['refTitle'], ...['subject', 'teacher', 'category', 'type', 'area', 'level', 'position', 'venue', 'time', 'pickupTime', 'dueDate', 'details', 'description', 'homework', 'action', 'treatment', 'resolution'].where((k) => d[k] != null && d[k].toString().isNotEmpty).map((k) => k == 'homework' ? 'HW: ${d[k]}' : k == 'dueDate' ? 'Due ${day(d[k])}' : d[k].toString())]; return parts.join(' · '); }
}

/// Staff: my duties and tasks.
class DutiesScreen extends StatefulWidget {
  const DutiesScreen({super.key});
  @override State<DutiesScreen> createState() => _D();
}
class _D extends State<DutiesScreen> {
  List rows = [];
  @override void initState() { super.initState(); load(); }
  Future<void> load() async { try { rows = await Api.get('/records/mine/duties'); } catch (_) {} if (mounted) setState(() {}); }
  @override Widget build(BuildContext context) => RefreshIndicator(onRefresh: load, child: ListView(padding: const EdgeInsets.all(12), children: [
    if (rows.isEmpty) const Padding(padding: EdgeInsets.all(24), child: Text('No duties assigned.', textAlign: TextAlign.center)),
    for (final r in rows) Card(child: ListTile(title: Text(r['title']), subtitle: Text([if (r['data']?['dueDate'] != null) 'Due ${day(r['data']['dueDate'])}', if (r['data']?['priority'] != null) r['data']['priority'], if (r['data']?['details'] != null) r['data']['details']].join(' · ')), trailing: r['status'] == 'done' ? const Icon(Icons.check_circle, color: Colors.green) : TextButton(onPressed: () async { await Api.put('/records/duty/${r['id']}', {'status': 'done'}); load(); }, child: const Text('Done')))),
  ]));
}
