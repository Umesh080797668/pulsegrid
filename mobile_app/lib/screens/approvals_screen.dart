import 'package:flutter/material.dart';
import 'package:dio/dio.dart';

class ApprovalsScreen extends StatefulWidget {
  const ApprovalsScreen({super.key});

  @override
  State<ApprovalsScreen> createState() => _ApprovalsScreenState();
}

class _ApprovalsScreenState extends State<ApprovalsScreen> {
  final Dio _dio = Dio();
  late Future<List<PendingApproval>> _approvalsFuture;

  @override
  void initState() {
    super.initState();
    _approvalsFuture = _fetchApprovals();
  }

  Future<List<PendingApproval>> _fetchApprovals() async {
    try {
      final response = await _dio.get('http://localhost:3001/api/v1/flows/pending-approvals');
      final List<dynamic> data = response.data as List<dynamic>;
      return data.map((item) => PendingApproval.fromJson(item as Map<String, dynamic>)).toList();
    } catch (e) {
      throw Exception('Failed to load approvals: $e');
    }
  }

  Future<void> _respondToApproval(String token, bool approved) async {
    try {
      final action = approved ? 'approve' : 'reject';
      await _dio.post('http://localhost:3001/api/v1/flows/approval/$token/$action');

      if (!mounted) return;
      setState(() {
        _approvalsFuture = _fetchApprovals();
      });

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(approved ? 'Approval sent' : 'Rejection sent'),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error: $e')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Approvals'),
      ),
      body: FutureBuilder<List<PendingApproval>>(
        future: _approvalsFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(child: Text('Error: ${snapshot.error}'));
          }
          if (!snapshot.hasData || snapshot.data!.isEmpty) {
            return const Center(
              child: Text('No pending approvals'),
            );
          }

          final approvals = snapshot.data!;
          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: approvals.length,
            itemBuilder: (context, index) {
              final approval = approvals[index];
              return Card(
                margin: const EdgeInsets.only(bottom: 16),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        approval.flowName,
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Step: ${approval.stepName}',
                        style: TextStyle(color: Colors.grey[600]),
                      ),
                      const SizedBox(height: 8),
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Colors.grey[100],
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          approval.message,
                          style: const TextStyle(fontSize: 14),
                        ),
                      ),
                      const SizedBox(height: 12),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                        children: [
                          Expanded(
                            child: OutlinedButton(
                              onPressed: () => _respondToApproval(approval.token, false),
                              child: const Text('Reject'),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: ElevatedButton(
                              onPressed: () => _respondToApproval(approval.token, true),
                              child: const Text('Approve'),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }
}

class PendingApproval {
  final String token;
  final String flowName;
  final String stepName;
  final String message;
  final DateTime createdAt;

  PendingApproval({
    required this.token,
    required this.flowName,
    required this.stepName,
    required this.message,
    required this.createdAt,
  });

  factory PendingApproval.fromJson(Map<String, dynamic> json) {
    return PendingApproval(
      token: json['token'] as String? ?? '',
      flowName: json['flowName'] as String? ?? 'Unknown',
      stepName: json['stepName'] as String? ?? 'Unknown',
      message: json['message'] as String? ?? '',
      createdAt: DateTime.parse(json['createdAt'] as String? ?? DateTime.now().toIso8601String()),
    );
  }
}
