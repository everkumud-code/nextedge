import 'package:flutter/material.dart';
import '../api.dart';
import '../widgets.dart';

/// Confidential counselling: student or parent writes to NextEdge counsellors; private thread; sessions.
class WellbeingScreen extends StatefulWidget {
  final String? studentId;
  const WellbeingScreen({this.studentId, super.key});
  @override State<WellbeingScreen> createState() => _W();
}
class _W extends State<WellbeingScreen> {
  List mine = [], posts = [], cats = []; String poweredBy = 'Psychographic Society';
  @override void initState() { super.initState(); load(); }
  Future<void> load() async { try { mine = await Api.get('/wellbeing/mine'); posts = await Api.get('/wellbeing/posts'); final c = await Api.get('/wellbeing/categories'); cats = c['categories']; poweredBy = c['poweredBy'] ?? poweredBy; } catch (_) {} if (mounted) setState(() {}); }

  Future<void> ask() async {
    String cat = cats.isNotEmpty ? cats.first['key'] : 'other'; bool urgent = false; final text = TextEditingController();
    final ok = await showDialog<bool>(context: context, builder: (_) => StatefulBuilder(builder: (ctx, set) => AlertDialog(title: const Text('Talk to a counsellor'), content: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Text('This is private. Your coaching will not see what you write.', style: TextStyle(fontSize: 13, color: Colors.grey)), const SizedBox(height: 8),
      DropdownButtonFormField<String>(initialValue: cat, items: cats.map<DropdownMenuItem<String>>((c) => DropdownMenuItem(value: c['key'], child: Text(c['label']))).toList(), onChanged: (v) => set(() => cat = v!), decoration: const InputDecoration(labelText: 'What is it about?')),
      TextField(controller: text, maxLines: 6, decoration: const InputDecoration(labelText: 'Tell us in your own words')),
      CheckboxListTile(value: urgent, onChanged: (v) => set(() => urgent = v!), title: const Text('I need help soon'), contentPadding: EdgeInsets.zero),
    ])), actions: [TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')), FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Send'))])));
    if (ok != true || text.text.trim().length < 5) return;
    await Api.post('/wellbeing/requests', {'category': cat, 'text': text.text.trim(), 'urgency': urgent ? 'urgent' : 'normal', if (widget.studentId != null) 'studentId': widget.studentId}); load();
  }
  Future<void> reply(Map r) async {
    final t = TextEditingController();
    final ok = await showDialog<bool>(context: context, builder: (_) => AlertDialog(title: const Text('Reply'), content: TextField(controller: t, maxLines: 5), actions: [TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')), FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Send'))]));
    if (ok != true || t.text.trim().isEmpty) return; await Api.post('/wellbeing/requests/${r['id']}/messages', {'text': t.text.trim()}); load();
  }

  @override
  Widget build(BuildContext context) => RefreshIndicator(onRefresh: load, child: ListView(padding: const EdgeInsets.all(16), children: [
    Card(color: Theme.of(context).colorScheme.primaryContainer, child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Text('Feeling stressed, stuck or low?', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)), const SizedBox(height: 4),
      const Text('Talk privately to a NextEdge counsellor. Your coaching will not see the conversation.'), const SizedBox(height: 10),
      FilledButton.icon(onPressed: ask, icon: const Icon(Icons.favorite_outline), label: const Text('Talk to a counsellor')), const SizedBox(height: 8), Text('Powered by $poweredBy', style: const TextStyle(fontSize: 12, fontStyle: FontStyle.italic))]))),
    if (mine.isNotEmpty) Section('My conversations', mine.map((r) { final msgs = r['messages'] as List; final s = r['status'];
      return Card(child: Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [Expanded(child: Text(r['category'].toString().replaceAll('-', ' '), style: const TextStyle(fontWeight: FontWeight.bold))), Chip(label: Text(s), backgroundColor: s == 'closed' ? Colors.grey.shade200 : Colors.green.shade100)]),
        if (r['expertName'] != null) Text('Counsellor: ${r['expertName']}', style: Theme.of(context).textTheme.bodySmall),
        if (r['sessionAt'] != null) Padding(padding: const EdgeInsets.symmetric(vertical: 6), child: Row(children: [Expanded(child: Text('Session: ${day(r['sessionAt'])} ${DateTime.parse(r['sessionAt']).toLocal().hour.toString().padLeft(2, '0')}:${DateTime.parse(r['sessionAt']).toLocal().minute.toString().padLeft(2, '0')}')), if (r['sessionUrl'] != null) FilledButton(onPressed: () => openUrl(r['sessionUrl']), child: const Text('Join'))])),
        ...msgs.map((m) => Align(alignment: m['senderRole'] == 'EXPERT' || m['senderRole'] == 'SUPER_ADMIN' ? Alignment.centerLeft : Alignment.centerRight, child: Container(margin: const EdgeInsets.symmetric(vertical: 3), padding: const EdgeInsets.all(8), constraints: const BoxConstraints(maxWidth: 280), decoration: BoxDecoration(color: m['senderRole'] == 'EXPERT' || m['senderRole'] == 'SUPER_ADMIN' ? Colors.blue.shade50 : Colors.grey.shade100, borderRadius: BorderRadius.circular(10)), child: Text(m['text'])))),
        if (s != 'closed') TextButton.icon(onPressed: () => reply(r), icon: const Icon(Icons.reply), label: const Text('Reply')),
      ]))); }).toList()),
    if (posts.isNotEmpty) Section('From our counsellors', posts.map((p) => Card(child: ListTile(title: Text(p['title']), subtitle: Text(p['body'], maxLines: 3, overflow: TextOverflow.ellipsis), onTap: () => showDialog(context: context, builder: (_) => AlertDialog(title: Text(p['title']), content: SingleChildScrollView(child: Text(p['body']))))))).toList()),
  ]));
}
