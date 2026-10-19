import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import '../api.dart';
import '../config.dart';

/// Batch group / parent-centre chat over Socket.IO (/chat namespace). Phone numbers are never shown.
class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key});
  @override State<ChatScreen> createState() => _C();
}
class _C extends State<ChatScreen> {
  io.Socket? socket; List<String> rooms = []; String? room; List msgs = []; final ctrl = TextEditingController(); final scroll = ScrollController(); String myId = '';
  @override void initState() { super.initState(); connect(); }
  Future<void> connect() async {
    final p = await SharedPreferences.getInstance(); final token = p.getString('token'); myId = p.getString('userId') ?? '';
    rooms = (await Api.get('/chat/rooms') as List).cast<String>(); if (rooms.isNotEmpty) { room = rooms.first; await history(); }
    final base = AppConfig.apiBase.replaceAll('/api', '');
    socket = io.io('$base/chat', io.OptionBuilder().setTransports(['websocket']).setAuth({'token': token}).build());
    socket!.on('message', (m) { if (m['room'] == room && mounted) setState(() { msgs.add(m); }); _scroll(); });
    if (mounted) setState(() {});
  }
  Future<void> history() async { final h = await Api.get('/chat/history?room=$room') as List; msgs = h.reversed.toList(); if (mounted) setState(() {}); _scroll(); }
  void _scroll() => Future.delayed(const Duration(milliseconds: 100), () { if (scroll.hasClients) scroll.jumpTo(scroll.position.maxScrollExtent); });
  void send() { final t = ctrl.text.trim(); if (t.isEmpty || room == null) return; socket?.emit('send', {'room': room, 'text': t}); ctrl.clear(); }
  String label(String r) => r.startsWith('batch:') ? 'Batch group' : r.startsWith('parent:') ? 'Centre' : r.startsWith('staff:') ? 'Staff room' : r;
  @override void dispose() { socket?.dispose(); super.dispose(); }
  @override
  Widget build(BuildContext context) {
    if (rooms.isEmpty) return const Center(child: Text('No chat rooms yet.'));
    return Column(children: [
      if (rooms.length > 1) Padding(padding: const EdgeInsets.all(8), child: DropdownButton<String>(value: room, isExpanded: true, items: rooms.map((r) => DropdownMenuItem(value: r, child: Text(label(r)))).toList(), onChanged: (v) { room = v; history(); })),
      Expanded(child: ListView.builder(controller: scroll, padding: const EdgeInsets.all(12), itemCount: msgs.length, itemBuilder: (_, i) { final m = msgs[i]; final me = m['senderId'] == myId;
        return Align(alignment: me ? Alignment.centerRight : Alignment.centerLeft, child: Container(margin: const EdgeInsets.symmetric(vertical: 3), padding: const EdgeInsets.all(10), constraints: const BoxConstraints(maxWidth: 300),
          decoration: BoxDecoration(color: me ? Theme.of(context).colorScheme.primaryContainer : Theme.of(context).colorScheme.surfaceContainerHighest, borderRadius: BorderRadius.circular(12)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('${m['senderName']} · ${(m['senderRole'] as String).toLowerCase()}', style: Theme.of(context).textTheme.labelSmall), Text(m['text'])]))); })),
      Padding(padding: const EdgeInsets.all(8), child: Row(children: [Expanded(child: TextField(controller: ctrl, decoration: const InputDecoration(hintText: 'Type a message', border: OutlineInputBorder()), onSubmitted: (_) => send())), IconButton(icon: const Icon(Icons.send), onPressed: send)])),
    ]);
  }
}
