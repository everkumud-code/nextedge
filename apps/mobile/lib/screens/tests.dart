import 'package:flutter/material.dart';
import '../api.dart';
import '../widgets.dart';

/// Student: attempt online tests, see results + weak chapters. Parent: results only.
class TestsScreen extends StatefulWidget {
  final String studentId; final bool canAttempt;
  const TestsScreen({required this.studentId, this.canAttempt = true, super.key});
  @override State<TestsScreen> createState() => _T();
}
class _T extends State<TestsScreen> {
  List tests = [];
  @override void initState() { super.initState(); load(); }
  Future<void> load() async { try { tests = await Api.get('/tests'); } catch (_) {} if (mounted) setState(() {}); }
  @override
  Widget build(BuildContext context) => RefreshIndicator(onRefresh: load, child: ListView(padding: const EdgeInsets.all(16), children: [
    if (tests.isEmpty) const Text('No tests yet.'),
    for (final t in tests) Builder(builder: (_) {
      final att = (t['attempts'] as List).where((a) => a['studentId'] == widget.studentId).toList(); final done = att.isNotEmpty && att.first['submitted'] == true;
      final published = t['resultsPublished'] == true;
      return Card(child: ListTile(
        title: Text(t['title']), subtitle: Text('${day(t['date'])} · ${t['mode'] == 'online' ? '${(t['questions'] as List).length} MCQs' : 'Paper test'} · max ${t['maxMarks']}'),
        trailing: published && done ? Text('${att.first['marks']}/${t['maxMarks']}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18))
          : done ? const Chip(label: Text('Submitted')) : t['mode'] == 'online' && widget.canAttempt ? FilledButton(onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => AttemptScreen(test: t, studentId: widget.studentId))).then((_) => load()), child: const Text('Attempt')) : const Chip(label: Text('Pending')),
        onTap: published ? () => Navigator.push(context, MaterialPageRoute(builder: (_) => ResultScreen(testId: t['id'], studentId: widget.studentId))) : null,
      ));
    }),
  ]));
}

class AttemptScreen extends StatefulWidget {
  final Map test; final String studentId;
  const AttemptScreen({required this.test, required this.studentId, super.key});
  @override State<AttemptScreen> createState() => _A();
}
class _A extends State<AttemptScreen> with WidgetsBindingObserver {
  final answers = <String, String>{}; int tabSwitches = 0; late DateTime endAt; bool busy = false;
  @override void initState() { super.initState(); WidgetsBinding.instance.addObserver(this); endAt = DateTime.now().add(Duration(minutes: widget.test['durationMin'] ?? 60)); Future.delayed(Duration(minutes: widget.test['durationMin'] ?? 60), () { if (mounted) submit(); }); }
  @override void dispose() { WidgetsBinding.instance.removeObserver(this); super.dispose(); }
  @override void didChangeAppLifecycleState(AppLifecycleState s) { if (s == AppLifecycleState.paused) tabSwitches++; }
  Future<void> submit() async {
    if (busy) return; setState(() => busy = true);
    try { final r = await Api.post('/tests/${widget.test['id']}/submit', {'studentId': widget.studentId, 'answers': answers, 'tabSwitches': tabSwitches});
      if (mounted) { await showDialog(context: context, builder: (_) => AlertDialog(title: const Text('Submitted'), content: Text(r['resultsPublished'] == true ? 'You scored ${r['marks']}/${r['maxMarks']}' : 'Your test is submitted. Marks appear once the teacher publishes results.'), actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('OK'))])); Navigator.pop(context); } }
    catch (e) { if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString()))); setState(() => busy = false); }
  }
  @override
  Widget build(BuildContext context) {
    final qs = widget.test['questions'] as List;
    return Scaffold(appBar: AppBar(title: Text(widget.test['title']), actions: [Padding(padding: const EdgeInsets.all(14), child: Text('${answers.length}/${qs.length}'))]),
      body: ListView.builder(padding: const EdgeInsets.all(12), itemCount: qs.length + 1, itemBuilder: (_, i) {
        if (i == qs.length) return Padding(padding: const EdgeInsets.all(12), child: FilledButton(onPressed: busy ? null : () async { final ok = await showDialog<bool>(context: context, builder: (_) => AlertDialog(title: const Text('Submit test?'), content: Text('${qs.length - answers.length} unanswered.'), actions: [TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Go back')), FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Submit'))])); if (ok == true) submit(); }, child: const Text('Submit test')));
        final q = qs[i]; final opts = q['opts'] as List; const L = ['A', 'B', 'C', 'D'];
        return Card(child: Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('${i + 1}. ${q['q']}', style: const TextStyle(fontWeight: FontWeight.w600)),
          for (var j = 0; j < opts.length; j++) RadioListTile<String>(dense: true, value: L[j], groupValue: answers['$i'], title: Text('${L[j]}. ${opts[j]}'), onChanged: (v) => setState(() => answers['$i'] = v!)),
        ])));
      }));
  }
}

class ResultScreen extends StatelessWidget {
  final String testId, studentId;
  const ResultScreen({required this.testId, required this.studentId, super.key});
  @override
  Widget build(BuildContext context) => Scaffold(appBar: AppBar(title: const Text('Result')), body: FutureBuilder(future: Api.get('/tests/$testId/results'), builder: (_, s) {
    if (!s.hasData) return const Center(child: CircularProgressIndicator());
    final r = s.data as Map; final mine = (r['mine'] as List).where((m) => m['id'] == studentId).toList(); final me = mine.isEmpty ? null : mine.first;
    final rows = r['rows'] as List;
    return ListView(padding: const EdgeInsets.all(16), children: [
      Text(r['test']['title'], style: Theme.of(context).textTheme.titleLarge),
      if (me != null) Row(children: [Stat('marks', '${me['marks'] ?? '—'}/${r['maxMarks']}'), Stat('rank', '${me['rank'] ?? '—'} / ${r['attempted']}'), Stat('percentile', '${me['percentile'] ?? '—'}')]),
      Text('Batch average ${r['average']}${r['topper'] != null ? ' · Topper ${r['topper']['marks']}' : ''}', style: Theme.of(context).textTheme.bodySmall),
      if (me != null && (me['weakChapters'] as List).isNotEmpty) Section('Work on these chapters', [Wrap(spacing: 6, children: (me['weakChapters'] as List).map<Widget>((c) => Chip(label: Text(c), backgroundColor: Colors.red.shade100)).toList())]),
      if (me != null && me['chapterScores'] != null) Section('Chapter-wise', (me['chapterScores'] as Map).entries.map((e) => ListTile(dense: true, title: Text(e.key), trailing: Text('${e.value['got']}/${e.value['total']}'))).toList()),
      Section('Batch ranking', rows.where((x) => x['rank'] != null).map((x) => ListTile(dense: true, leading: Text('${x['rank']}'), title: Text(x['name']), trailing: Text('${x['marks']}'))).toList()),
    ]);
  }));
}
