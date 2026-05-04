import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import 'package:intl/intl.dart';

class ApprovalsScreen extends StatefulWidget {
  const ApprovalsScreen({super.key});

  @override
  State<ApprovalsScreen> createState() => _ApprovalsScreenState();
}

class _ApprovalsScreenState extends State<ApprovalsScreen> {
  final Dio _dio = Dio();
  late Future<List<PendingApproval>> _approvalsFuture;
  bool _showExpired = false;

  @override
  void initState() {
    super.initState();
    _approvalsFuture = _fetchApprovals();
  }

  Future<List<PendingApproval>> _fetchApprovals() async {
    try {
      final response = await _dio.get('http://localhost:3001/api/v1/approvals');
      final List<dynamic> data = response.data['data'] as List<dynamic>;
      return data
          .map((item) => PendingApproval.fromJson(item as Map<String, dynamic>))
          .toList();
    } catch (e) {
      throw Exception('Failed to load approvals: $e');
    }
  }

  Future<void> _respondToApproval(String token, bool approved) async {
    try {
      final decision = approved ? 'approved' : 'rejected';
      await _dio.post(
        'http://localhost:3001/api/v1/approvals/$token/decide',
        data: {
          'token': token,
          'decision': decision,
          'reason': approved ? null : 'Rejected from mobile app',
        },
      );

      if (!mounted) return;
      setState(() {
        _approvalsFuture = _fetchApprovals();
      });

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(approved ? '✅ Approval sent' : '❌ Rejection sent'),
          backgroundColor: approved ? Colors.green : Colors.red,
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Error: $e'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Approvals'),
        elevation: 0,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () {
              setState(() {
                _approvalsFuture = _fetchApprovals();
              });
            },
          ),
        ],
      ),
      body: FutureBuilder<List<PendingApproval>>(
        future: _approvalsFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.error_outline, size: 48, color: Colors.red),
                  const SizedBox(height: 16),
                  Text('Error: ${snapshot.error}'),
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: () {
                      setState(() {
                        _approvalsFuture = _fetchApprovals();
                      });
                    },
                    child: const Text('Retry'),
                  ),
                ],
              ),
            );
          }
          if (!snapshot.hasData || snapshot.data!.isEmpty) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.check_circle_outline, size: 64, color: Colors.grey[400]),
                  const SizedBox(height: 16),
                  const Text(
                    'No pending approvals',
                    style: TextStyle(fontSize: 18, color: Colors.grey),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'You\'re all caught up!',
                    style: TextStyle(color: Colors.grey),
                  ),
                ],
              ),
            );
          }

          final approvals = snapshot.data!;
          final pendingApprovals = approvals.where((a) => a.status == 'pending').toList();
          final otherApprovals = approvals.where((a) => a.status != 'pending').toList();

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              if (pendingApprovals.isNotEmpty) ...[
                _buildSectionTitle('Pending Approvals (${pendingApprovals.length})'),
                const SizedBox(height: 12),
                ...pendingApprovals.map((approval) => _buildApprovalCard(context, approval)).toList(),
              ],
              if (otherApprovals.isNotEmpty && _showExpired) ...[
                const SizedBox(height: 24),
                _buildSectionTitle('Previous Approvals (${otherApprovals.length})'),
                const SizedBox(height: 12),
                ...otherApprovals.map((approval) => _buildApprovalCard(context, approval, disabled: true)).toList(),
              ] else if (otherApprovals.isNotEmpty) ...[
                const SizedBox(height: 24),
                SizedBox(
                  width: double.infinity,
                  child: TextButton(
                    onPressed: () {
                      setState(() {
                        _showExpired = true;
                      });
                    },
                    child: Text('Show ${otherApprovals.length} previous approvals'),
                  ),
                ),
              ],
            ],
          );
        },
      ),
    );
  }

  Widget _buildSectionTitle(String title) {
    return Text(
      title,
      style: const TextStyle(
        fontSize: 16,
        fontWeight: FontWeight.bold,
        color: Colors.grey,
      ),
    );
  }

  Widget _buildApprovalCard(BuildContext context, PendingApproval approval, {bool disabled = false}) {
    final isExpired = approval.expiresAt.isBefore(DateTime.now());
    final timeRemaining = _formatTimeRemaining(approval.expiresAt);

    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      elevation: disabled ? 0 : 2,
      color: disabled ? Colors.grey[100] : Colors.white,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header with flow name and status
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        approval.flowName,
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                          color: disabled ? Colors.grey[500] : Colors.black87,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Step: ${approval.stepId}',
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.grey[600],
                        ),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: _getStatusColor(approval.status),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    approval.status.toUpperCase(),
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),

            // Message
            if (approval.message.isNotEmpty) ...[
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.blue[50],
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.blue[200]!),
                ),
                child: Text(
                  approval.message,
                  style: const TextStyle(fontSize: 14),
                ),
              ),
              const SizedBox(height: 12),
            ],

            // Approvers list
            if (approval.approvers.isNotEmpty) ...[
              Text(
                'Approvers',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.bold,
                  color: Colors.grey[600],
                ),
              ),
              const SizedBox(height: 8),
              ...approval.approvers.asMap().entries.map((entry) {
                final approver = entry.value;
                return Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          approver['approver_email'] ?? 'Unknown',
                          style: const TextStyle(fontSize: 13),
                        ),
                      ),
                      _buildApproverStatusBadge(approver['status']),
                    ],
                  ),
                );
              }).toList(),
              const SizedBox(height: 12),
            ],

            // Metadata
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Created: ${DateFormat('MMM d, HH:mm').format(approval.createdAt)}',
                  style: TextStyle(fontSize: 11, color: Colors.grey[600]),
                ),
                if (!disabled && !isExpired)
                  Text(
                    'Expires: $timeRemaining',
                    style: TextStyle(
                      fontSize: 11,
                      color: timeRemaining.contains('minutes') ? Colors.orange : Colors.grey[600],
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 12),

            // Action buttons
            if (!disabled && approval.status == 'pending' && !isExpired) ...[
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => _respondToApproval(approval.token, false),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.red,
                        side: const BorderSide(color: Colors.red),
                      ),
                      child: const Text('❌ Reject'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: () => _respondToApproval(approval.token, true),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.green,
                        foregroundColor: Colors.white,
                      ),
                      child: const Text('✅ Approve'),
                    ),
                  ),
                ],
              ),
            ] else if (disabled || isExpired) ...[
              Container(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Center(
                  child: Text(
                    isExpired ? 'Approval expired' : 'No actions available',
                    style: TextStyle(color: Colors.grey[500], fontSize: 12),
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildApproverStatusBadge(String? status) {
    final statusMap = {
      'approved': ('✅', Colors.green[100], Colors.green[800]),
      'rejected': ('❌', Colors.red[100], Colors.red[800]),
      'pending': ('⏳', Colors.yellow[100], Colors.yellow[800]),
    };

    final (emoji, bgColor, textColor) = statusMap[status] ?? ('?', Colors.grey[100], Colors.grey[800]);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        emoji,
        style: TextStyle(fontSize: 12, color: textColor),
      ),
    );
  }

  Color _getStatusColor(String status) {
    switch (status) {
      case 'approved':
        return Colors.green;
      case 'rejected':
        return Colors.red;
      case 'expired':
        return Colors.orange;
      default:
        return Colors.blue;
    }
  }

  String _formatTimeRemaining(DateTime expiresAt) {
    final now = DateTime.now();
    final remaining = expiresAt.difference(now);

    if (remaining.isNegative) {
      return 'Expired';
    }

    if (remaining.inHours > 0) {
      return '${remaining.inHours}h remaining';
    }

    if (remaining.inMinutes > 0) {
      return '${remaining.inMinutes}m remaining';
    }

    return 'Expires soon';
  }
}

class PendingApproval {
  final String token;
  final String flowName;
  final String stepId;
  final String message;
  final String status;
  final DateTime createdAt;
  final DateTime expiresAt;
  final List<Map<String, dynamic>> approvers;

  PendingApproval({
    required this.token,
    required this.flowName,
    required this.stepId,
    required this.message,
    required this.status,
    required this.createdAt,
    required this.expiresAt,
    required this.approvers,
  });

  factory PendingApproval.fromJson(Map<String, dynamic> json) {
    return PendingApproval(
      token: json['approval_token'] as String? ?? '',
      flowName: json['context_json']?['flow_name'] as String? ?? 'Unknown Flow',
      stepId: json['step_id'] as String? ?? 'Unknown Step',
      message: json['context_json']?['message'] as String? ?? '',
      status: json['status'] as String? ?? 'pending',
      createdAt: DateTime.parse(
        json['created_at'] as String? ?? DateTime.now().toIso8601String(),
      ),
      expiresAt: DateTime.parse(
        json['expires_at'] as String? ?? DateTime.now().add(Duration(hours: 24)).toIso8601String(),
      ),
      approvers: List<Map<String, dynamic>>.from(
        json['approvers'] as List? ?? [],
      ),
    );
  }
}
