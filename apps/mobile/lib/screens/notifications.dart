import 'package:flutter/material.dart';
import '../api.dart';
import '../widgets.dart';

/// The bell: every notification sent to this user, newest first.
class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});
  @override State<NotificationsScreen> createState() => _N();
}
class _N extends State<NotificationsScreen> {
  List items = [];
  @override void initState() { super.initState(); load(); }
  Future<void> load() async { try { final r = await Api.get('/notifications/mine'); items = r['items']; await Api.post('/notifications/read-all', {}); } catch (_) {} if (mounted) setState(() {}); }
  @override
  Widget build(BuildContext context) => Scaffold(appBar: AppBar(title: const Text('Notifications')), body: RefreshIndicator(onRefresh: load, child: ListView(padding: const EdgeInsets.all(12), children: [
    if (items.isEmpty) const Padding(padding: EdgeInsets.all(16), child: Text('Nothing yet.')),
    for (final n in items) Card(child: ListTile(leading: Icon(n['readAt'] == null ? Icons.notifications_active : Icons.notifications_none, color: n['readAt'] == null ? Theme.of(context).colorScheme.primary : null), title: Text(n['title'], style: TextStyle(fontWeight: n['readAt'] == null ? FontWeight.bold : FontWeight.normal)), subtitle: Text('${n['body']}\n${day(n['createdAt'])}'), isThreeLine: true)),
  ])));
}

/// AppBar bell with unread badge.
class BellAction extends StatefulWidget {
  const BellAction({super.key});
  @override State<BellAction> createState() => _B();
}
class _B extends State<BellAction> {
  int unread = 0;
  @override void initState() { super.initState(); refresh(); }
  Future<void> refresh() async { try { final r = await Api.get('/notifications/mine'); if (mounted) setState(() => unread = r['unread'] ?? 0); } catch (_) {} }
  @override
  Widget build(BuildContext context) => Stack(children: [
    IconButton(icon: const Icon(Icons.notifications_outlined), onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const NotificationsScreen())).then((_) => refresh())),
    if (unread > 0) Positioned(right: 6, top: 6, child: Container(padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1), decoration: BoxDecoration(color: Colors.red, borderRadius: BorderRadius.circular(10)), child: Text('$unread', style: const TextStyle(color: Colors.white, fontSize: 10)))),
  ]);
}
