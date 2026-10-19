import 'package:flutter/material.dart';
import '../api.dart';
import '../widgets.dart';
import 'home.dart';
import 'chat.dart';

class ParentHome extends StatefulWidget {
  const ParentHome({super.key});
  @override State<ParentHome> createState() => _P();
}
class _P extends State<ParentHome> {
  int tab = 0; List kids = [], ledger = [], notices = []; Map<String, List> history = {};
  @override void initState() { super.initState(); load(); }
  Future<void> load() async {
    try { kids = await Api.get('/attendance/summary'); ledger = await Api.get('/fees/ledger'); notices = await Api.get('/notices');
      for (final k in kids) { history[k['id']] = await Api.get('/attendance/history?studentId=${k['id']}'); } } catch (_) {}
    if (mounted) setState(() {});
  }
  Future<void> pay(Map row) async {
    final r = await Api.post('/fees/pay-link', {'studentId': row['studentId']});
    if (r['url'] != null) { await openUrl(r['url']); } else if (mounted) { ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(r['error'] ?? 'Could not start payment'))); }
  }
  @override
  Widget build(BuildContext context) {
    final pages = [
      RefreshIndicator(onRefresh: load, child: ListView(padding: const EdgeInsets.all(16), children: [
        if (kids.isEmpty) const Card(child: Padding(padding: EdgeInsets.all(16), child: Text('No student is linked to this mobile number yet. Ask the centre to check the admission form.'))),
        for (final k in kids) ...[
          Text(k['name'], style: Theme.of(context).textTheme.titleLarge),
          Row(children: [
            Stat('attendance (month)', k['pct'] == null ? '—' : '${k['pct']}%', color: k['low'] == true ? Colors.red : Colors.green),
            Builder(builder: (_) { final l = ledger.where((x) => x['studentId'] == k['id']).toList(); final bal = l.isEmpty ? 0 : (l.first['balance'] as num); return Stat('fee due', '₹${bal.toStringAsFixed(0)}', color: bal > 0 ? Colors.red : Colors.green); }),
          ]),
          Builder(builder: (_) { final l = ledger.where((x) => x['studentId'] == k['id']).toList(); if (l.isEmpty || (l.first['balance'] as num) <= 0) return const SizedBox(); return Padding(padding: const EdgeInsets.symmetric(vertical: 6), child: FilledButton.icon(icon: const Icon(Icons.currency_rupee), label: Text('Pay ₹${(l.first['balance'] as num).toStringAsFixed(0)} now'), onPressed: () => pay(l.first))); }),
          Section('Last 10 days', [Wrap(spacing: 6, runSpacing: 6, children: (history[k['id']] ?? []).take(10).map<Widget>((h) { final s = h['status']; return Chip(label: Text('${day(h['date'])} · ${s == 'PRESENT' ? 'P' : s == 'ABSENT' ? 'A' : s == 'LATE' ? 'L' : 'Lv'}'), backgroundColor: s == 'ABSENT' ? Colors.red.shade100 : s == 'PRESENT' ? Colors.green.shade100 : Colors.orange.shade100); }).toList())]),
          const Divider(),
        ],
        Section('Notices', notices.isEmpty ? [const Text('No notices yet.')] : notices.take(5).map((n) => NoticeTile(n, onOpen: () async { await Api.post('/notices/${n['id']}/read', {}); load(); })).toList()),
      ])),
      const ChatScreen(),
    ];
    return Scaffold(
      appBar: AppBar(title: const Text('Coaching Connect'), actions: [IconButton(icon: const Icon(Icons.logout), onPressed: () => logout(context))]),
      body: pages[tab],
      bottomNavigationBar: NavigationBar(selectedIndex: tab, onDestinationSelected: (i) => setState(() => tab = i), destinations: const [
        NavigationDestination(icon: Icon(Icons.family_restroom), label: 'My child'), NavigationDestination(icon: Icon(Icons.chat_bubble_outline), label: 'Message centre')]),
    );
  }
}
