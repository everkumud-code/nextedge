import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../api.dart';
import 'login.dart';

// Phase 1: role-based home. Student/parent see notices + attendance; faculty gets roll call. Build out per CLAUDE.md.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  List notices = []; String name = '', role = '';
  @override
  void initState() { super.initState(); load(); }
  Future<void> load() async {
    final p = await SharedPreferences.getInstance();
    name = p.getString('name') ?? ''; role = p.getString('role') ?? '';
    try { notices = await Api.get('/notices'); } catch (_) {}
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text('Hi $name'), actions: [IconButton(icon: const Icon(Icons.logout), onPressed: () async { (await SharedPreferences.getInstance()).clear(); if (mounted) Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => const LoginScreen())); })]),
        body: RefreshIndicator(
          onRefresh: load,
          child: ListView(padding: const EdgeInsets.all(16), children: [
            Text('Notices', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            if (notices.isEmpty) const Text('No notices yet.'),
            for (final n in notices) Card(child: ListTile(title: Text(n['title']), subtitle: Text(n['body']), trailing: Text(n['type'], style: const TextStyle(fontSize: 11)))),
          ]),
        ),
      );
}
