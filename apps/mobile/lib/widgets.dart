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
