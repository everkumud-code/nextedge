import 'package:flutter/material.dart';
import '../theme.dart';
import '../widgets.dart';
import 'home.dart';
import 'notifications.dart';
import 'school.dart';
import 'bus.dart';

/// Home for office / transport staff (for example the bus driver): share the bus location, and apply for leave.
class StaffHome extends StatelessWidget {
  const StaffHome({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          title: const Text('NextEdge'),
          actions: [const Padding(padding: EdgeInsets.only(right: 8), child: Clock()), const BellAction(), const ThemeAction(), IconButton(icon: const Icon(Icons.logout), onPressed: () => logout(context))],
        ),
        body: Column(children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: Card(
              child: ListTile(
                leading: const Icon(Icons.directions_bus, size: 32),
                title: const Text('Share bus location'),
                subtitle: const Text('Start the trip so parents can see the bus'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ShareBusScreen())),
              ),
            ),
          ),
          const Expanded(child: StaffHrScreen()),
        ]),
      );
}
