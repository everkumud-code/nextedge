import 'package:flutter_test/flutter_test.dart';
import 'package:coaching_connect/main.dart';

void main() {
  testWidgets('app builds', (tester) async {
    await tester.pumpWidget(const CoachingApp());
    expect(find.byType(CoachingApp), findsOneWidget);
  });
}
