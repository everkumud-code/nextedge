import 'package:flutter/material.dart';
import '../api.dart';
import 'home.dart';
import 'chat.dart';

/// Faculty: one-tap roll call per batch + notices + chat.
class FacultyHome extends StatefulWidget {
  const FacultyHome({super.key});
  @override State<FacultyHome> createState() => _F();
}
class _F extends State<FacultyHome> {
  int tab = 0; List batches = [], students = []; String? batchId; Map<String, String> marks = {}; String msg = '';
  String get today => DateTime.now().toIso8601String().substring(0, 10);
  @override void initState() { super.initState(); load(); }
  Future<void> load() async {
    try { batches = await Api.get('/batches'); if (batchId == null && batches.isNotEmpty) batchId = batches.first['id']; await loadBatch(); } catch (_) {}
    if (mounted) setState(() {});
  }
  Future<void> loadBatch() async {
    if (batchId == null) return;
    students = (await Api.get('/students?batchId=$batchId') as List).where((s) => s['active'] != false).toList();
    final att = await Api.get('/attendance?batchId=$batchId&date=$today') as List;
    marks = {for (final s in students) s['id']: 'PRESENT'}; for (final a in att) { marks[a['studentId']] = a['status']; }
    if (mounted) setState(() {});
  }
  Future<void> save() async {
    await Api.post('/attendance', {'batchId': batchId, 'date': today, 'marks': students.map((s) => {'studentId': s['id'], 'status': marks[s['id']]}).toList()});
    setState(() => msg = 'Attendance saved for ${students.length} students · parents of absentees notified');
  }
  @override
  Widget build(BuildContext context) {
    final present = marks.values.where((v) => v == 'PRESENT' || v == 'LATE').length;
    final pages = [
      Column(children: [
        Padding(padding: const EdgeInsets.all(12), child: Row(children: [
          Expanded(child: DropdownButtonFormField<String>(initialValue: batchId, items: batches.map<DropdownMenuItem<String>>((b) => DropdownMenuItem(value: b['id'], child: Text(b['name']))).toList(), onChanged: (v) { batchId = v; loadBatch(); }, decoration: const InputDecoration(labelText: 'Batch'))),
          const SizedBox(width: 12), Text('$present / ${students.length}'),
        ])),
        Expanded(child: ListView(children: students.map((s) => ListTile(
          title: Text(s['name']), subtitle: Text(s['rollNo'] ?? ''),
          trailing: SegmentedButton<String>(showSelectedIcon: false, segments: const [ButtonSegment(value: 'PRESENT', label: Text('P')), ButtonSegment(value: 'ABSENT', label: Text('A')), ButtonSegment(value: 'LATE', label: Text('L')), ButtonSegment(value: 'LEAVE', label: Text('Lv'))],
            selected: {marks[s['id']] ?? 'PRESENT'}, onSelectionChanged: (v) => setState(() => marks[s['id']] = v.first)),
        )).toList())),
        if (msg.isNotEmpty) Padding(padding: const EdgeInsets.all(8), child: Text(msg, style: const TextStyle(color: Colors.green))),
        Padding(padding: const EdgeInsets.all(12), child: SizedBox(width: double.infinity, child: FilledButton(onPressed: students.isEmpty ? null : save, child: const Text('Save attendance')))),
      ]),
      const ChatScreen(),
    ];
    return Scaffold(
      appBar: AppBar(title: const Text('Roll call'), actions: [IconButton(icon: const Icon(Icons.logout), onPressed: () => logout(context))]),
      body: pages[tab],
      bottomNavigationBar: NavigationBar(selectedIndex: tab, onDestinationSelected: (i) => setState(() => tab = i), destinations: const [
        NavigationDestination(icon: Icon(Icons.checklist), label: 'Attendance'), NavigationDestination(icon: Icon(Icons.chat_bubble_outline), label: 'Chat')]),
    );
  }
}
