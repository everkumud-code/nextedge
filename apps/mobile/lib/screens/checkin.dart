import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import '../api.dart';

/// Teacher / staff GPS check-in card. The server rejects positions outside the centre's geofence.
class CheckInCard extends StatefulWidget {
  const CheckInCard({super.key});
  @override State<CheckInCard> createState() => _C();
}
class _C extends State<CheckInCard> {
  Map? me; bool busy = false; String? msg;
  @override void initState() { super.initState(); load(); }
  Future<void> load() async { try { me = await Api.get('/staff-attendance/me'); } catch (_) {} if (mounted) setState(() {}); }
  Future<Position> locate() async {
    if (!await Geolocator.isLocationServiceEnabled()) throw Exception('Turn on GPS / location on your phone.');
    var p = await Geolocator.checkPermission(); if (p == LocationPermission.denied) p = await Geolocator.requestPermission();
    if (p == LocationPermission.denied || p == LocationPermission.deniedForever) throw Exception('Location permission is needed to check in.');
    return Geolocator.getCurrentPosition(locationSettings: const LocationSettings(accuracy: LocationAccuracy.high));
  }
  Future<void> act(String what) async {
    setState(() { busy = true; msg = null; });
    try { final pos = await locate(); final r = await Api.post('/staff-attendance/$what', {'lat': pos.latitude, 'lng': pos.longitude, 'accuracy': pos.accuracy});
      msg = what == 'check-in' ? (r['already'] == true ? 'Already checked in today' : 'Checked in · ${r['status']}${r['minsLate'] > 0 ? ' (${r['minsLate']} min late)' : ''} · ${r['distanceM']} m from centre') : 'Checked out · ${(r['minutes'] / 60).toStringAsFixed(1)} h · ${r['status']}'; await load(); }
    catch (e) { msg = e.toString().replaceFirst('Exception: ', ''); }
    if (mounted) setState(() => busy = false);
  }
  String t(String? iso) { if (iso == null) return '—'; final d = DateTime.parse(iso).toLocal(); return '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}'; }
  @override
  Widget build(BuildContext context) {
    final today = me?['today']; final m = me?['month'];
    return Card(child: Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [const Icon(Icons.fingerprint), const SizedBox(width: 8), Text('My attendance', style: Theme.of(context).textTheme.titleMedium), const Spacer(), if (today != null) Chip(label: Text(today['status']))]),
      const SizedBox(height: 6),
      Text('In ${t(today?['checkIn'])} · Out ${t(today?['checkOut'])}${m != null ? '  ·  Month: ${m['present']} days, ${m['late']} late' : ''}', style: Theme.of(context).textTheme.bodySmall),
      const SizedBox(height: 8),
      Row(children: [
        Expanded(child: FilledButton.icon(onPressed: busy || today?['checkIn'] != null ? null : () => act('check-in'), icon: const Icon(Icons.login), label: const Text('Check in'))),
        const SizedBox(width: 8),
        Expanded(child: OutlinedButton.icon(onPressed: busy || today?['checkIn'] == null || today?['checkOut'] != null ? null : () => act('check-out'), icon: const Icon(Icons.logout), label: const Text('Check out'))),
      ]),
      if (busy) const Padding(padding: EdgeInsets.only(top: 8), child: LinearProgressIndicator()),
      if (msg != null) Padding(padding: const EdgeInsets.only(top: 6), child: Text(msg!, style: TextStyle(color: msg!.contains('m from the centre') && msg!.contains('allowed') ? Colors.red : null))),
    ])));
  }
}
