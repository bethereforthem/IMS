import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/auth/screens/login_screen.dart';
import '../features/auth/screens/mfa_screen.dart';
import '../features/suspects/screens/suspects_screen.dart';
import '../features/suspects/screens/suspect_detail_screen.dart';
import '../features/div_app/screens/div_home_screen.dart';
import '../features/div_app/screens/nid_scan_screen.dart';
import '../features/div_app/screens/nid_manual_screen.dart';
import '../features/face_scan/screens/face_scan_screen.dart';
import '../features/alerts/screens/alerts_screen.dart';
import '../features/dashboard/role_dashboard_dispatcher.dart';
import 'auth/auth_provider.dart';

final routerProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authStateProvider);

  return GoRouter(
    initialLocation: '/login',
    redirect: (context, state) {
      final isLoggedIn = authState.valueOrNull != null;
      final isAuthRoute = state.matchedLocation.startsWith('/login') ||
          state.matchedLocation.startsWith('/mfa');
      if (!isLoggedIn && !isAuthRoute) return '/login';
      if (isLoggedIn && isAuthRoute) return '/dashboard';
      return null;
    },
    routes: [
      GoRoute(path: '/login', builder: (c, s) => const LoginScreen()),
      GoRoute(path: '/mfa', builder: (c, s) => const MfaScreen()),
      // Role-dispatched dashboard — renders the correct institution home screen
      GoRoute(path: '/dashboard', builder: (c, s) => const RoleDashboardDispatcher()),
      // DIV app sub-screens (launched from within each dashboard's DIV tab)
      GoRoute(path: '/div', builder: (c, s) => const DivHomeScreen()),
      GoRoute(path: '/div/nid-scan', builder: (c, s) => const NidScanScreen()),
      GoRoute(path: '/div/nid-manual', builder: (c, s) => const NidManualScreen()),
      GoRoute(path: '/div/face-scan', builder: (c, s) => const FaceScanScreen()),
      GoRoute(path: '/suspects', builder: (c, s) => const SuspectsScreen()),
      GoRoute(
        path: '/suspects/:id',
        builder: (c, s) => SuspectDetailScreen(suspectId: s.pathParameters['id']!),
      ),
      GoRoute(path: '/alerts', builder: (c, s) => const AlertsScreen()),
    ],
  );
});
