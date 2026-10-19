import 'package:flutter/material.dart';
import '../api.dart';
import '../widgets.dart';
import 'home.dart';
import 'study.dart';
import 'chat.dart';

class StudentHome extends StatefulWidget {
  const StudentHome({super.key});
  @override State<StudentHome> createState() => _S();
}
class _S extends State<StudentHome> {
  int tab = 0; List notices = [], summary = [], timetable = [];
  @override void initState() { super.initState(); load(); }
  Future<void> load() async {
    try { notices = await Api.get('/notices'); summary = await Api.get('/attendance/summary'); timetable = await Api.get('/timetable'); } catch (_) {}
    if (mounted) setState(() {});
  }
  @override
  Widget build(BuildContext context) {
    final me = summary.isNotEmpty ? summary.first : null; final wd = DateTime.now().weekday % 7;
    final todayClasses = timetable.where((t) => t['weekday'] == wd && (me == null || t['batchId'] == me['batchId'])).toList()..sort((a, b) => (a['startTime'] as String).compareTo(b['startTime']));
    final pages = [
      RefreshIndicator(onRefresh: load, child: ListView(padding: const EdgeInsets.all(16), children: [
        Row(children: [Stat('attendance this month', me == null || me['pct'] == null ? '—' : '${me['pct']}%', color: me != null && me['low'] == true ? Colors.red : Colors.green), Stat('classes today', '${todayClasses.length}')]),
        const SizedBox(height: 12),
        Section('Today’s classes', todayClasses.isEmpty ? [const Text('No classes scheduled today.')] : todayClasses.map((t) => Card(child: ListTile(leading: Text(t['startTime'], style: const TextStyle(fontWeight: FontWeight.bold)), title: Text(t['subject']), subtitle: Text('${t['startTime']}–${t['endTime']}${t['room'] != null ? ' · Room ${t['room']}' : ''}')))).toList()),
        Section('Notices', notices.isEmpty ? [const Text('No notices yet.')] : notices.take(5).map((n) => NoticeTile(n, onOpen: () async { await Api.post('/notices/${n['id']}/read', {}); load(); })).toList()),
      ])),
      const StudyScreen(),
      const ChatScreen(),
    ];
    return Scaffold(
      appBar: AppBar(title: const Text('Coaching Connect'), actions: [IconButton(icon: const Icon(Icons.logout), onPressed: () => logout(context))]),
      body: pages[tab],
      bottomNavigationBar: NavigationBar(selectedIndex: tab, onDestinationSelected: (i) => setState(() => tab = i), destinations: const [
        NavigationDestination(icon: Icon(Icons.today), label: 'Today'), NavigationDestination(icon: Icon(Icons.menu_book), label: 'Study'), NavigationDestination(icon: Icon(Icons.chat_bubble_outline), label: 'Chat')]),
    );
  }
}
