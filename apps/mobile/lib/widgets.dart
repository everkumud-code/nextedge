import 'dart:async';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

class Section extends StatelessWidget {
  final String title; final List<Widget> children;
  const Section(this.title, this.children, {super.key});
  @override
  Widget build(BuildContext context) => Padding(padding: const EdgeInsets.only(bottom: 16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
    Text(title, style: Theme.of(context).textTheme.titleMedium), const SizedBox(height: 6), ...children]));
}

class Stat extends StatelessWidget {
  final String label, value; final Color? color;
  const Stat(this.label, this.value, {this.color, super.key});
  @override
  Widget build(BuildContext context) => Expanded(child: Card(child: Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
    Text(value, style: Theme.of(context).textTheme.headlineSmall?.copyWith(color: color, fontWeight: FontWeight.bold)), Text(label, style: Theme.of(context).textTheme.bodySmall)]))));
}

class NoticeTile extends StatelessWidget {
  final Map n; final VoidCallback? onOpen;
  const NoticeTile(this.n, {this.onOpen, super.key});
  @override
  Widget build(BuildContext context) {
    final urgent = n['type'] == 'URGENT'; final read = n['read'] == true;
    return Card(color: urgent ? Colors.red.shade50 : null, child: ListTile(
      leading: Icon(read ? Icons.drafts_outlined : Icons.mark_email_unread, color: urgent ? Colors.red : null),
      title: Text(n['title'] ?? '', style: TextStyle(fontWeight: read ? FontWeight.normal : FontWeight.bold)),
      subtitle: Text(n['body'] ?? '', maxLines: 3, overflow: TextOverflow.ellipsis), onTap: onOpen));
  }
}

Future<void> openUrl(String url) async { final u = Uri.parse(url); if (await canLaunchUrl(u)) await launchUrl(u, mode: LaunchMode.externalApplication); }
String day(String iso) { final d = DateTime.tryParse(iso); if (d == null) return iso; const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; return '${d.day} ${m[d.month - 1]}'; }

/// Pinned announcement banner (shown at the top of Today). Tap to open.
class AnnouncementBanner extends StatelessWidget {
  final List notices;
  const AnnouncementBanner(this.notices, {super.key});
  @override
  Widget build(BuildContext context) {
    final pinned = notices.where((n) => n['pinned'] == true).toList();
    if (pinned.isEmpty) return const SizedBox();
    return Column(children: pinned.take(3).map((n) => Card(color: Theme.of(context).colorScheme.primaryContainer, child: InkWell(onTap: () => showDialog(context: context, builder: (_) => AlertDialog(title: Text(n['title']), content: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, children: [if (n['imageUrl'] != null) Image.network(n['imageUrl'], errorBuilder: (_, __, ___) => const SizedBox()), Text(n['body'])])))),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (n['imageUrl'] != null) ClipRRect(borderRadius: const BorderRadius.vertical(top: Radius.circular(12)), child: Image.network(n['imageUrl'], height: 140, fit: BoxFit.cover, errorBuilder: (_, __, ___) => const SizedBox())),
        Padding(padding: const EdgeInsets.all(12), child: Row(children: [const Icon(Icons.campaign), const SizedBox(width: 8), Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(n['title'], style: const TextStyle(fontWeight: FontWeight.bold)), Text(n['body'], maxLines: 2, overflow: TextOverflow.ellipsis)]))])),
      ])))).toList());
  }
}

/// Live date + time (device local time) for the app bar.
class Clock extends StatefulWidget {
  const Clock({super.key});
  @override State<Clock> createState() => _ClockState();
}
class _ClockState extends State<Clock> {
  late Timer t; DateTime now = DateTime.now();
  @override void initState() { super.initState(); t = Timer.periodic(const Duration(seconds: 30), (_) => setState(() => now = DateTime.now())); }
  @override void dispose() { t.cancel(); super.dispose(); }
  @override
  Widget build(BuildContext context) {
    const d = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']; const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    final h = now.hour % 12 == 0 ? 12 : now.hour % 12; final ap = now.hour < 12 ? 'am' : 'pm';
    return Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
      Text('$h:${now.minute.toString().padLeft(2, '0')} $ap', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
      Text('${d[now.weekday - 1]}, ${now.day} ${m[now.month - 1]} ${now.year}', style: const TextStyle(fontSize: 11)),
    ]);
  }
}
