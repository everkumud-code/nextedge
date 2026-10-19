import 'package:flutter/material.dart';
import '../api.dart';
import '../widgets.dart';

/// Student: doubt box. Parent: leave requests + feedback. One screen, tabs by role.
class SupportScreen extends StatefulWidget {
  final String studentId; final String role;
  const SupportScreen({required this.studentId, required this.role, super.key});
  @override State<SupportScreen> createState() => _S();
}
class _S extends State<SupportScreen> with SingleTickerProviderStateMixin {
  late TabController tabs; List doubts = [], leaves = [], feedback = [];
  List<String> get tabNames => widget.role == 'STUDENT' ? ['Doubts', 'Leave'] : ['Leave', 'Feedback', 'Doubts'];
  @override void initState() { super.initState(); tabs = TabController(length: tabNames.length, vsync: this); load(); }
  Future<void> load() async { try { doubts = await Api.get('/doubts'); leaves = await Api.get('/leaves'); feedback = await Api.get('/feedback'); } catch (_) {} if (mounted) setState(() {}); }

  Future<void> askDoubt() async {
    final subj = TextEditingController(), q = TextEditingController(), img = TextEditingController();
    final ok = await showDialog<bool>(context: context, builder: (_) => AlertDialog(title: const Text('Ask a doubt'), content: Column(mainAxisSize: MainAxisSize.min, children: [TextField(controller: subj, decoration: const InputDecoration(labelText: 'Subject')), TextField(controller: q, maxLines: 4, decoration: const InputDecoration(labelText: 'Your question')), TextField(controller: img, decoration: const InputDecoration(labelText: 'Photo link (optional)'))]), actions: [TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')), FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Send'))]));
    if (ok != true || q.text.trim().isEmpty) return;
    await Api.post('/doubts', {'studentId': widget.studentId, 'subject': subj.text.trim().isEmpty ? 'General' : subj.text.trim(), 'question': q.text.trim(), if (img.text.trim().isNotEmpty) 'imageUrl': img.text.trim()}); load();
  }
  Future<void> applyLeave() async {
    final reason = TextEditingController(); DateTime from = DateTime.now(), to = DateTime.now();
    final ok = await showDialog<bool>(context: context, builder: (_) => StatefulBuilder(builder: (ctx, set) => AlertDialog(title: const Text('Apply for leave'), content: Column(mainAxisSize: MainAxisSize.min, children: [
      ListTile(title: Text('From: ${from.toIso8601String().substring(0, 10)}'), onTap: () async { final d = await showDatePicker(context: ctx, initialDate: from, firstDate: DateTime.now().subtract(const Duration(days: 30)), lastDate: DateTime.now().add(const Duration(days: 365))); if (d != null) set(() { from = d; if (to.isBefore(from)) to = from; }); }),
      ListTile(title: Text('To: ${to.toIso8601String().substring(0, 10)}'), onTap: () async { final d = await showDatePicker(context: ctx, initialDate: to, firstDate: from, lastDate: DateTime.now().add(const Duration(days: 365))); if (d != null) set(() => to = d); }),
      TextField(controller: reason, decoration: const InputDecoration(labelText: 'Reason'))]), actions: [TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')), FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Apply'))])));
    if (ok != true || reason.text.trim().isEmpty) return;
    await Api.post('/leaves', {'studentId': widget.studentId, 'fromDate': from.toIso8601String().substring(0, 10), 'toDate': to.toIso8601String().substring(0, 10), 'reason': reason.text.trim()}); load();
  }
  Future<void> sendFeedback() async {
    final text = TextEditingController(); String kind = 'feedback';
    final ok = await showDialog<bool>(context: context, builder: (_) => StatefulBuilder(builder: (ctx, set) => AlertDialog(title: const Text('Write to the centre'), content: Column(mainAxisSize: MainAxisSize.min, children: [DropdownButton<String>(value: kind, items: const [DropdownMenuItem(value: 'feedback', child: Text('Feedback')), DropdownMenuItem(value: 'complaint', child: Text('Complaint')), DropdownMenuItem(value: 'suggestion', child: Text('Suggestion'))], onChanged: (v) => set(() => kind = v!)), TextField(controller: text, maxLines: 5, decoration: const InputDecoration(labelText: 'Message'))]), actions: [TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')), FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Send'))])));
    if (ok != true || text.text.trim().isEmpty) return;
    await Api.post('/feedback', {'kind': kind, 'text': text.text.trim(), 'studentId': widget.studentId}); load();
  }

  Widget doubtsTab() => RefreshIndicator(onRefresh: load, child: ListView(padding: const EdgeInsets.all(16), children: [
    if (widget.role == 'STUDENT') FilledButton.icon(onPressed: askDoubt, icon: const Icon(Icons.help_outline), label: const Text('Ask a doubt')),
    const SizedBox(height: 8), if (doubts.isEmpty) const Text('No doubts yet.'),
    for (final d in doubts) Card(child: Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text('${d['subject']} · ${day(d['createdAt'])}', style: Theme.of(context).textTheme.labelSmall), Text(d['question']),
      if (d['answer'] != null) Container(margin: const EdgeInsets.only(top: 8), padding: const EdgeInsets.all(8), decoration: BoxDecoration(color: Colors.green.shade50, borderRadius: BorderRadius.circular(8)), child: Text('Answer: ${d['answer']}')) else const Padding(padding: EdgeInsets.only(top: 6), child: Text('Waiting for teacher…', style: TextStyle(color: Colors.orange))),
      if (d['answer'] != null && d['resolved'] != true && widget.role == 'STUDENT') TextButton(onPressed: () async { await Api.post('/doubts/${d['id']}/resolve', {}); load(); }, child: const Text('Got it, resolved')),
    ])))]));
  Widget leavesTab() => RefreshIndicator(onRefresh: load, child: ListView(padding: const EdgeInsets.all(16), children: [
    FilledButton.icon(onPressed: applyLeave, icon: const Icon(Icons.event_busy), label: const Text('Apply for leave')), const SizedBox(height: 8), if (leaves.isEmpty) const Text('No leave requests.'),
    for (final l in leaves) Card(child: ListTile(title: Text('${l['fromDate']} → ${l['toDate']}'), subtitle: Text('${l['reason']}${l['note'] != null ? '\n' + l['note'] : ''}'), trailing: Chip(label: Text(l['status']), backgroundColor: l['status'] == 'approved' ? Colors.green.shade100 : l['status'] == 'rejected' ? Colors.red.shade100 : null)))]));
  Widget feedbackTab() => RefreshIndicator(onRefresh: load, child: ListView(padding: const EdgeInsets.all(16), children: [
    FilledButton.icon(onPressed: sendFeedback, icon: const Icon(Icons.mail_outline), label: const Text('Write to the centre')), const SizedBox(height: 8), if (feedback.isEmpty) const Text('Nothing sent yet.'),
    for (final f in feedback) Card(child: ListTile(title: Text(f['text']), subtitle: Text('${f['kind']} · ${day(f['createdAt'])}${f['reply'] != null ? '\nReply: ' + f['reply'] : ''}'), trailing: f['reply'] == null ? const Icon(Icons.hourglass_empty) : const Icon(Icons.check, color: Colors.green)))]));

  @override
  Widget build(BuildContext context) {
    final views = widget.role == 'STUDENT' ? [doubtsTab(), leavesTab()] : [leavesTab(), feedbackTab(), doubtsTab()];
    return Column(children: [TabBar(controller: tabs, tabs: tabNames.map((t) => Tab(text: t)).toList()), Expanded(child: TabBarView(controller: tabs, children: views))]);
  }
}
