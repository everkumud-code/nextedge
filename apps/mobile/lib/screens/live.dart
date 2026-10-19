import 'package:flutter/material.dart';
import '../api.dart';
import '../widgets.dart';

class LiveScreen extends StatefulWidget {
  final String studentId;
  const LiveScreen({required this.studentId, super.key});
  @override State<LiveScreen> createState() => _L();
}
class _L extends State<LiveScreen> {
  List rows = [];
  @override void initState() { super.initState(); load(); }
  Future<void> load() async { try { rows = await Api.get('/live'); } catch (_) {} if (mounted) setState(() {}); }
  Future<void> join(Map l) async {
    final r = await Api.post('/live/${l['id']}/join', {'studentId': widget.studentId});
    if (r['joinUrl'] != null) { await openUrl(r['joinUrl']); await Api.post('/live/${l['id']}/leave', {'studentId': widget.studentId}); }
  }
  @override
  Widget build(BuildContext context) => RefreshIndicator(onRefresh: load, child: ListView(padding: const EdgeInsets.all(16), children: [
    if (rows.isEmpty) const Text('No live classes scheduled.'),
    for (final l in rows) Builder(builder: (_) { final st = DateTime.parse(l['startAt']).toLocal(); final live = l['status'] == 'live'; final soon = l['status'] == 'scheduled' && st.difference(DateTime.now()).inMinutes < 15;
      return Card(color: live ? Colors.green.shade50 : null, child: ListTile(
        leading: Icon(live ? Icons.sensors : l['status'] == 'ended' ? Icons.check_circle_outline : Icons.schedule, color: live ? Colors.green : null),
        title: Text(l['title']), subtitle: Text('${day(l['startAt'])} ${st.hour.toString().padLeft(2, '0')}:${st.minute.toString().padLeft(2, '0')} · ${l['durationMin']} min · ${l['status']}'),
        trailing: live || soon ? FilledButton(onPressed: () => join(l), child: Text(live ? 'Join now' : 'Join')) : l['recordingUrl'] != null ? TextButton(onPressed: () => openUrl(l['recordingUrl']), child: const Text('Recording')) : null)); }),
  ]));
}
