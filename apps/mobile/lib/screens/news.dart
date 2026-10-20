import 'package:flutter/material.dart';
import '../api.dart';
import '../widgets.dart';

/// Current affairs & news — free public feeds, cached by the server.
class NewsScreen extends StatefulWidget {
  const NewsScreen({super.key});
  @override State<NewsScreen> createState() => _N();
}
class _N extends State<NewsScreen> {
  List cats = []; String cat = 'current-affairs'; List items = []; bool busy = false; String? cachedAt;
  @override void initState() { super.initState(); init(); }
  Future<void> init() async { try { cats = await Api.get('/news/categories'); } catch (_) {} await load(); }
  Future<void> load() async { setState(() => busy = true); try { final r = await Api.get('/news?category=$cat'); items = r['items']; cachedAt = r['cachedAt']; } catch (_) {} if (mounted) setState(() => busy = false); }
  String ago(String iso) { final d = DateTime.tryParse(iso); if (d == null) return ''; final m = DateTime.now().difference(d).inMinutes; if (m < 60) return '$m min ago'; if (m < 1440) return '${m ~/ 60} h ago'; return day(iso); }
  @override
  Widget build(BuildContext context) => Column(children: [
    SizedBox(height: 52, child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8), children: cats.map((c) => Padding(padding: const EdgeInsets.only(right: 6), child: ChoiceChip(label: Text(c['label']), selected: cat == c['key'], onSelected: (_) { cat = c['key']; load(); }))).toList())),
    if (busy) const LinearProgressIndicator(),
    Expanded(child: RefreshIndicator(onRefresh: load, child: ListView(padding: const EdgeInsets.all(12), children: [
      if (items.isEmpty && !busy) const Padding(padding: EdgeInsets.all(16), child: Text('No news loaded yet. Pull down to refresh.')),
      for (final n in items) Card(child: ListTile(title: Text(n['title'], style: const TextStyle(fontWeight: FontWeight.w600)), subtitle: Text('${n['source']} · ${ago(n['publishedAt'])}${(n['summary'] ?? '').toString().isNotEmpty ? '\n${n['summary']}' : ''}', maxLines: 4, overflow: TextOverflow.ellipsis), isThreeLine: true, trailing: const Icon(Icons.open_in_new, size: 18), onTap: () => openUrl(n['link']))),
      if (items.isNotEmpty) Padding(padding: const EdgeInsets.all(12), child: Text('Free public feeds (Google News, PIB). Updated every 30 minutes.', style: Theme.of(context).textTheme.bodySmall, textAlign: TextAlign.center)),
    ]))),
  ]);
}
