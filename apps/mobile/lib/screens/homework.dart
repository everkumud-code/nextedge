import 'package:flutter/material.dart';
import '../api.dart';
import '../widgets.dart';

class HomeworkScreen extends StatefulWidget {
  final String studentId; final bool canSubmit;
  const HomeworkScreen({required this.studentId, this.canSubmit = true, super.key});
  @override State<HomeworkScreen> createState() => _H();
}
class _H extends State<HomeworkScreen> {
  List rows = [];
  @override void initState() { super.initState(); load(); }
  Future<void> load() async { try { rows = await Api.get('/homework'); } catch (_) {} if (mounted) setState(() {}); }
  Future<void> submit(Map h) async {
    final ctrl = TextEditingController();
    final ok = await showDialog<bool>(context: context, builder: (_) => AlertDialog(title: Text(h['title']), content: TextField(controller: ctrl, maxLines: 6, decoration: const InputDecoration(hintText: 'Type your answer, or paste a Drive/photo link')), actions: [TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')), FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Submit'))]));
    if (ok != true || ctrl.text.trim().isEmpty) return;
    try { final r = await Api.post('/homework/${h['id']}/submit', {'studentId': widget.studentId, 'text': ctrl.text.trim()}); if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(r['late'] == true ? 'Submitted (late)' : 'Submitted'))); load(); }
    catch (e) { if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString()))); }
  }
  @override
  Widget build(BuildContext context) => RefreshIndicator(onRefresh: load, child: ListView(padding: const EdgeInsets.all(16), children: [
    if (rows.isEmpty) const Text('No homework yet.'),
    for (final h in rows) Builder(builder: (_) {
      final subs = (h['submissions'] as List).where((s) => s['studentId'] == widget.studentId).toList(); final sub = subs.isEmpty ? null : subs.first;
      final due = DateTime.parse(h['dueAt']).toLocal(); final late = sub == null && DateTime.now().isAfter(due);
      return Card(child: ListTile(
        title: Text(h['title']), isThreeLine: h['description'] != null,
        subtitle: Text('${h['subject'] ?? ''} · due ${day(h['dueAt'])} ${due.hour.toString().padLeft(2, '0')}:${due.minute.toString().padLeft(2, '0')}${h['description'] != null ? '\n${h['description']}' : ''}'),
        trailing: sub != null ? Chip(label: Text(sub['grade'] != null ? 'Grade ${sub['grade']}' : 'Submitted'), backgroundColor: sub['grade'] != null ? Colors.green.shade100 : null)
          : late ? const Chip(label: Text('Overdue'), backgroundColor: Color(0xFFFFCDD2)) : widget.canSubmit ? FilledButton(onPressed: () => submit(h), child: const Text('Submit')) : const Chip(label: Text('Pending')),
        onTap: sub != null && sub['remark'] != null ? () => showDialog(context: context, builder: (_) => AlertDialog(title: const Text('Teacher’s remark'), content: Text(sub['remark']))) : null,
      ));
    }),
  ]));
}
