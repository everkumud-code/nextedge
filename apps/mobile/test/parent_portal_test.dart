import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:coaching_connect/api.dart';
import 'package:coaching_connect/screens/parent_portal.dart';

Map<String, dynamic> kid(String id, String name, {List alerts = const []}) => {'id': id, 'name': name, 'className': 'Class 4', 'section': 'A', 'rollNo': '3', 'alerts': alerts};

Map<String, dynamic> detail(String name, {num balance = 4400}) => {
      'profile': {'id': 'x', 'batchId': 'b1', 'name': name},
      'teachers': [],
      'week': [],
      'attendance': {'overallPct': 85, 'months': [{'month': '2026-11', 'present': 11, 'late': 2, 'absent': 5, 'leave': 1, 'marked': 18, 'pct': 72}], 'days': []},
      'fees': {'plan': 'Tuition', 'cycle': 'monthly', 'due': 14400, 'paid': 14400 - balance, 'balance': balance},
      'receipts': [{'id': 'r1', 'receiptNo': 'R-1001', 'amount': 4000, 'mode': 'UPI', 'paidOn': '2026-10-17'}],
      'leaves': [],
      'upcomingExams': [],
    };

http.Response ok(Object body) => http.Response.bytes(utf8.encode(jsonEncode(body)), 200, headers: {'content-type': 'application/json; charset=utf-8'});

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({'token': 't', 'role': 'PARENT'});
  });
  tearDown(() { Api.testClient = null; });

  Future<void> settle(WidgetTester t) async { for (int i = 0; i < 6; i++) { await t.pump(const Duration(milliseconds: 20)); } }

  testWidgets('parent portal: alerts on Today, then the Fees screen with receipts and Pay', (t) async {
    Api.testClient = MockClient((req) async {
      final p = req.url.path;
      if (p.endsWith('/parent/overview')) { return ok({'children': [kid('k1', 'Yash Singh', alerts: [{'level': 'warn', 'text': '₹4,400 fees are due for Yash.', 'to': '/p/fees'}])], 'unreadNotices': 2}); }
      if (p.endsWith('/parent/child/k1')) { return ok(detail('Yash Singh')); }
      return ok([]);
    });
    await t.pumpWidget(const MaterialApp(home: Scaffold(body: ParentPortal())));
    await settle(t);
    expect(find.text('₹4,400 fees are due for Yash.'), findsOneWidget);
    expect(find.text('Yash Singh · Class 4 · Section A · Roll 3'), findsOneWidget);
    expect(find.text('72%'), findsOneWidget);
    await t.tap(find.text('Fees').last);
    await settle(t);
    expect(find.text('Pay ₹4400 online'), findsOneWidget);
    expect(find.text('R-1001'), findsNothing); // the receipt number sits in the subtitle with the date
    expect(find.textContaining('R-1001'), findsOneWidget);
  });

  testWidgets('parent portal: two children, the picker switches the child', (t) async {
    Api.testClient = MockClient((req) async {
      final p = req.url.path;
      if (p.endsWith('/parent/overview')) { return ok({'children': [kid('k1', 'Yash Singh'), kid('k2', 'Meera Singh')], 'unreadNotices': 0}); }
      if (p.endsWith('/parent/child/k1')) { return ok(detail('Yash Singh', balance: 4400)); }
      if (p.endsWith('/parent/child/k2')) { return ok(detail('Meera Singh', balance: 0)); }
      return ok([]);
    });
    await t.pumpWidget(const MaterialApp(home: Scaffold(body: ParentPortal())));
    await settle(t);
    expect(find.text('Yash Singh'), findsWidgets);
    expect(find.text('Meera Singh'), findsOneWidget); // the chip
    expect(find.text('₹4400'), findsOneWidget); // fee due of the first child
    await t.tap(find.text('Meera Singh'));
    await settle(t);
    expect(find.text('Meera Singh · Class 4 · Section A · Roll 3'), findsOneWidget);
    expect(find.text('₹0'), findsOneWidget); // fee due of the second child
  });

  testWidgets('parent portal: a login with no child linked says so', (t) async {
    Api.testClient = MockClient((req) async => ok({'children': [], 'unreadNotices': 0}));
    await t.pumpWidget(const MaterialApp(home: Scaffold(body: ParentPortal())));
    await settle(t);
    expect(find.textContaining('No student is linked to this login yet'), findsOneWidget);
  });

  // The same answers the real server gave for a demo family (two children, one mobile): every screen is walked through.
  testWidgets('parent portal: every screen opens with real server data', (t) async {
    await t.binding.setSurfaceSize(const Size(800, 3200)); // a tall screen, so the long lists are built down to the last button
    addTearDown(() => t.binding.setSurfaceSize(null));
    final fx = jsonDecode(File('test/fixtures/parent_api.json').readAsStringSync()) as Map<String, dynamic>;
    Api.testClient = MockClient((req) async {
      final path = req.url.path.replaceFirst('/api', '') + (req.url.hasQuery ? '?${req.url.query}' : '');
      return ok(fx.containsKey(path) ? fx[path] : []);
    });
    await t.pumpWidget(const MaterialApp(home: Scaffold(body: ParentPortal())));
    await settle(t);
    expect(find.textContaining('is marked absent today'), findsOneWidget);
    expect(find.textContaining('fees are due for Yash'), findsOneWidget);

    await t.tap(find.text('Progress').last);
    await settle(t);
    expect(find.text('Latest result: Half Yearly'), findsOneWidget);
    expect(find.textContaining('Class position #1'), findsOneWidget);
    expect(find.text('Download report card (PDF)'), findsOneWidget);

    await t.tap(find.text('Attendance').last);
    await settle(t);
    expect(find.text('Apply for leave'), findsOneWidget);
    expect(find.text('Month by month'), findsOneWidget);

    await t.tap(find.text('Homework').last);
    await settle(t);
    expect(find.text('To do (2)'), findsOneWidget);
    expect(find.text('Table of 12 and 13'), findsOneWidget);
    expect(find.text('Water cycle: evaporation and rain'), findsOneWidget);
    expect(find.text('Practice sheet: tables 2 to 15'), findsOneWidget);

    await t.tap(find.text('Fees').last);
    await settle(t);
    expect(find.textContaining('Pay ₹'), findsOneWidget);

    await t.tap(find.text('More').last);
    await settle(t);
    await t.tap(find.text('Timetable'));
    await settle(t);
    expect(find.textContaining('Monday'), findsOneWidget);
    await t.pageBack();
    await settle(t);
    await t.tap(find.textContaining('Notices & events'));
    await settle(t);
    expect(find.text('Winter uniform from 1 December'), findsOneWidget);
    expect(find.text('Annual Day'), findsOneWidget);
    expect(find.text('Book'), findsWidgets);
  });

  testWidgets('parent portal: the second child has no result, homework or timetable yet and the screens say so', (t) async {
    final fx = jsonDecode(File('test/fixtures/parent_api.json').readAsStringSync()) as Map<String, dynamic>;
    Api.testClient = MockClient((req) async {
      final path = req.url.path.replaceFirst('/api', '') + (req.url.hasQuery ? '?${req.url.query}' : '');
      return ok(fx.containsKey(path) ? fx[path] : []);
    });
    await t.pumpWidget(const MaterialApp(home: Scaffold(body: ParentPortal())));
    await settle(t);
    await t.tap(find.text('Meera Singh'));
    await settle(t);
    await t.tap(find.text('Progress').last);
    await settle(t);
    expect(find.textContaining('No result has been published yet'), findsOneWidget);
    await t.tap(find.text('Homework').last);
    await settle(t);
    expect(find.text('To do (0)'), findsOneWidget);
    expect(find.textContaining('Nothing pending'), findsOneWidget);
  });
}
