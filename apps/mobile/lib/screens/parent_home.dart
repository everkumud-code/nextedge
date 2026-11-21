import 'package:flutter/material.dart';
import '../theme.dart';
import '../widgets.dart';
import 'home.dart';
import 'notifications.dart';
import 'parent_portal.dart';

/// The parent's app: every child linked to the login, with Today, Progress, Attendance, Homework, Fees and More (see parent_portal.dart).
class ParentHome extends StatelessWidget {
  const ParentHome({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('NextEdge'), actions: [const Padding(padding: EdgeInsets.only(right: 8), child: Clock()), const BellAction(), const ThemeAction(), IconButton(icon: const Icon(Icons.logout), onPressed: () => logout(context))]),
        body: const ParentPortal(),
      );
}
