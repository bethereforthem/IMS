import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/auth/auth_provider.dart';
import 'screens/niss_dashboard.dart';
import 'screens/rnp_dashboard.dart';
import 'screens/rib_dashboard.dart';
import 'screens/rdf_dashboard.dart';
import 'screens/rcs_dashboard.dart';
import 'screens/patrol_dashboard.dart';
import '../auth/screens/login_screen.dart';

class RoleDashboardDispatcher extends ConsumerWidget {
  const RoleDashboardDispatcher({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authStateProvider);

    return auth.when(
      loading: () => const Scaffold(
        backgroundColor: Color(0xFF0F172A),
        body: Center(child: CircularProgressIndicator(color: Color(0xFF00438B))),
      ),
      error: (_, __) => const LoginScreen(),
      data: (user) {
        if (user == null) return const LoginScreen();
        final role = user.role;

        if (role.startsWith('NISS') || role == 'SIEM_ANALYST') {
          return const NISSDashboard();
        }
        if (role.startsWith('RNP') || role == 'SYSTEM_ADMIN') {
          return const RNPDashboard();
        }
        if (role.startsWith('RIB')) {
          return const RIBDashboard();
        }
        if (role.startsWith('RDF')) {
          return const RDFDashboard();
        }
        if (role.startsWith('RCS')) {
          return const RCSDashboard();
        }
        if (role == 'VILLAGE_LEADER' || role == 'IRONDO_PATROL' || role == 'DASSO_OFFICER') {
          return const PatrolDashboard();
        }
        // Unknown role — show a generic screen rather than login
        return const PatrolDashboard();
      },
    );
  }
}
