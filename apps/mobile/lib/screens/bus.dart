import 'dart:async';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import '../api.dart';
import '../widgets.dart';

String _age(int m) => m < 1 ? 'just now' : m < 60 ? '$m min ago' : m < 1440 ? '${(m / 60).round()} h ago' : '${(m / 1440).round()} days ago';

/// Parent / student: where is my child's bus right now.
class BusScreen extends StatefulWidget {
  const BusScreen({super.key});
  @override
  State<BusScreen> createState() => _BusState();
}

class _BusState extends State<BusScreen> {
  List rows = [];
  bool busy = true;
  String? err;
  Timer? timer;

  @override
  void initState() {
    super.initState();
    load();
    timer = Timer.periodic(const Duration(seconds: 30), (_) => load());
  }

  @override
  void dispose() {
    timer?.cancel();
    super.dispose();
  }

  Future<void> load() async {
    try {
      rows = await Api.get('/transport/live/mine');
      err = null;
    } catch (e) {
      err = '$e';
    }
    if (mounted) setState(() => busy = false);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Where is the bus?')),
        body: busy
            ? const Center(child: CircularProgressIndicator())
            : RefreshIndicator(
                onRefresh: load,
                child: ListView(padding: const EdgeInsets.all(12), children: [
                  if (err != null) Padding(padding: const EdgeInsets.all(12), child: Text(err!, style: const TextStyle(color: Colors.red))),
                  if (err == null && rows.isEmpty) const Padding(padding: EdgeInsets.all(24), child: Text('No school bus is assigned to your child yet. Please ask the school office.')),
                  ...rows.map((r) {
                    final p = r['position'];
                    final old = p != null && (p['ageMin'] as num) > 10;
                    return Card(
                      child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text('${r['student'] ?? ''} · ${r['route'] ?? ''}', style: const TextStyle(fontWeight: FontWeight.bold)),
                          const SizedBox(height: 4),
                          Text([if (r['vehicle'] != null) 'Bus ${r['vehicle']}', if (r['stop'] != null) 'Stop: ${r['stop']}', if (r['pickupTime'] != null) 'Pickup ${r['pickupTime']}'].join(' · ')),
                          const SizedBox(height: 8),
                          if (p == null)
                            const Text('The bus location is not available yet.')
                          else
                            Text('Last seen ${_age((p['ageMin'] as num).toInt())}${p['speed'] != null ? ' · ${p['speed']} km/h' : ''}', style: TextStyle(color: old ? Colors.red : Colors.green.shade800)),
                          const SizedBox(height: 8),
                          Wrap(spacing: 8, children: [
                            if (p != null) FilledButton.icon(onPressed: () => openUrl(p['maps'] as String), icon: const Icon(Icons.map), label: const Text('Open map')),
                            if (r['driverMobile'] != null) OutlinedButton.icon(onPressed: () => openUrl('tel:${r['driverMobile']}'), icon: const Icon(Icons.call), label: Text('Call ${r['driver'] ?? 'driver'}')),
                          ]),
                        ]),
                      ),
                    );
                  }),
                ]),
              ),
      );
}

/// Driver / transport staff: send this phone's position to the school every 20 seconds while this screen is open.
class ShareBusScreen extends StatefulWidget {
  const ShareBusScreen({super.key});
  @override
  State<ShareBusScreen> createState() => _ShareState();
}

class _ShareState extends State<ShareBusScreen> {
  List routes = [];
  String? routeId;
  bool on = false;
  bool busy = true;
  String status = 'Not sharing';
  Timer? timer;

  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void dispose() {
    timer?.cancel();
    super.dispose();
  }

  Future<void> load() async {
    try {
      routes = await Api.get('/transport/live');
      if (routes.isNotEmpty) routeId = routes.first['routeId'] as String;
    } catch (e) {
      status = '$e';
    }
    if (mounted) setState(() => busy = false);
  }

  Future<void> send() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) throw Exception('Turn on GPS / location on your phone.');
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) perm = await Geolocator.requestPermission();
      if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) throw Exception('Allow location for this app.');
      final pos = await Geolocator.getCurrentPosition(locationSettings: const LocationSettings(accuracy: LocationAccuracy.high));
      final kmh = pos.speed < 0 ? 0.0 : double.parse((pos.speed * 3.6).toStringAsFixed(1));
      await Api.post('/transport/location/mine', {'routeId': routeId, 'lat': pos.latitude, 'lng': pos.longitude, 'speed': kmh});
      if (!mounted) return;
      status = 'Sent at ${TimeOfDay.now().format(context)}';
    } catch (e) {
      status = '$e';
    }
    if (mounted) setState(() {});
  }

  void toggle() {
    if (on) {
      timer?.cancel();
      setState(() {
        on = false;
        status = 'Stopped';
      });
    } else {
      setState(() {
        on = true;
        status = 'Starting…';
      });
      send();
      timer = Timer.periodic(const Duration(seconds: 20), (_) => send());
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Share bus location')),
        body: busy
            ? const Center(child: CircularProgressIndicator())
            : ListView(padding: const EdgeInsets.all(16), children: [
                const Text('Keep this screen open while the bus is running. Parents see the bus on their phone.'),
                const SizedBox(height: 12),
                if (routes.isEmpty) const Text('No routes yet. Ask the office to add your route.'),
                if (routes.isNotEmpty)
                  DropdownButtonFormField<String>(
                    initialValue: routeId,
                    items: routes.map<DropdownMenuItem<String>>((r) => DropdownMenuItem<String>(value: r['routeId'] as String, child: Text('${r['route']}${r['vehicle'] != null ? ' · ${r['vehicle']}' : ''}'))).toList(),
                    onChanged: on ? null : (v) => setState(() => routeId = v),
                    decoration: const InputDecoration(labelText: 'Route'),
                  ),
                const SizedBox(height: 16),
                FilledButton.icon(onPressed: routeId == null ? null : toggle, icon: Icon(on ? Icons.stop : Icons.play_arrow), label: Text(on ? 'Stop sharing' : 'Start sharing')),
                const SizedBox(height: 12),
                Text(status),
              ]),
      );
}
