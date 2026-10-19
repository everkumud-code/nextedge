import 'package:flutter/material.dart';
import '../api.dart';
import '../widgets.dart';

class StudyScreen extends StatefulWidget {
  const StudyScreen({super.key});
  @override State<StudyScreen> createState() => _St();
}
class _St extends State<StudyScreen> {
  List items = [];
  @override void initState() { super.initState(); load(); }
  Future<void> load() async { try { items = await Api.get('/content'); } catch (_) {} if (mounted) setState(() {}); }
  Future<void> open(Map c) async {
    if (c['fileKey'] != null) { final r = await Api.get('/content/${c['id']}/file'); if (r['url'] != null) openUrl(r['url']); }
    else if (c['url'] != null) { openUrl(c['url']); }
    else if (c['body'] != null) { showDialog(context: context, builder: (_) => AlertDialog(title: Text(c['title']), content: SingleChildScrollView(child: Text(c['body'])))); }
  }
  @override
  Widget build(BuildContext context) {
    final subjects = <String, List>{}; for (final c in items) { subjects.putIfAbsent(c['subject'], () => []).add(c); }
    return RefreshIndicator(onRefresh: load, child: ListView(padding: const EdgeInsets.all(16), children: [
      if (items.isEmpty) const Text('No study material yet.'),
      for (final e in subjects.entries) Section(e.key, e.value.map((c) => Card(child: ListTile(
        leading: Icon(c['kind'] == 'video' ? Icons.play_circle_outline : c['kind'] == 'file' ? Icons.picture_as_pdf : c['kind'] == 'text' ? Icons.notes : Icons.link),
        title: Text(c['title']), subtitle: Text(c['chapter'] ?? ''), onTap: () => open(c)))).toList()),
    ]));
  }
}
