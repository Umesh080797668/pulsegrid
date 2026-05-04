import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import 'package:intl/intl.dart';

class CircuitBreakerDashboardScreen extends StatefulWidget {
  const CircuitBreakerDashboardScreen({super.key});

  @override
  State<CircuitBreakerDashboardScreen> createState() => _CircuitBreakerDashboardScreenState();
}

class _CircuitBreakerDashboardScreenState extends State<CircuitBreakerDashboardScreen> {
  final Dio _dio = Dio();
  late Future<List<ConnectorHealth>> _healthFuture;

  @override
  void initState() {
    super.initState();
    _healthFuture = _fetchConnectorHealth();
  }

  Future<List<ConnectorHealth>> _fetchConnectorHealth() async {
    try {
      final response = await _dio.get('http://localhost:3001/api/v1/connectors/health');
      final List<dynamic> data = response.data['data'] as List<dynamic>;
      return data
          .map((item) => ConnectorHealth.fromJson(item as Map<String, dynamic>))
          .toList();
    } catch (e) {
      throw Exception('Failed to load connector health: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Connector Health'),
        elevation: 0,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () {
              setState(() {
                _healthFuture = _fetchConnectorHealth();
              });
            },
          ),
        ],
      ),
      body: FutureBuilder<List<ConnectorHealth>>(
        future: _healthFuture,
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
                        _healthFuture = _fetchConnectorHealth();
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
                  Icon(Icons.info_outline, size: 64, color: Colors.grey[400]),
                  const SizedBox(height: 16),
                  const Text(
                    'No connector health data',
                    style: TextStyle(fontSize: 18, color: Colors.grey),
                  ),
                ],
              ),
            );
          }

          final connectors = snapshot.data!;
          final healthy = connectors.where((c) => c.status == 'healthy').length;
          final degraded = connectors.where((c) => c.status == 'degraded').length;
          final circuitOpen = connectors.where((c) => c.status == 'circuit_open').length;

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              // Summary cards
              _buildSummaryCards(healthy, degraded, circuitOpen),
              const SizedBox(height: 24),

              // Connectors list
              if (circuitOpen > 0) ...[
                _buildSectionTitle('Circuit Open (${circuitOpen})'),
                const SizedBox(height: 12),
                ...connectors
                    .where((c) => c.status == 'circuit_open')
                    .map((connector) => _buildConnectorCard(context, connector))
                    .toList(),
                const SizedBox(height: 24),
              ],
              if (degraded > 0) ...[
                _buildSectionTitle('Degraded (${degraded})'),
                const SizedBox(height: 12),
                ...connectors
                    .where((c) => c.status == 'degraded')
                    .map((connector) => _buildConnectorCard(context, connector))
                    .toList(),
                const SizedBox(height: 24),
              ],
              if (healthy > 0) ...[
                _buildSectionTitle('Healthy (${healthy})'),
                const SizedBox(height: 12),
                ...connectors
                    .where((c) => c.status == 'healthy')
                    .map((connector) => _buildConnectorCard(context, connector))
                    .toList(),
              ],
            ],
          );
        },
      ),
    );
  }

  Widget _buildSummaryCards(int healthy, int degraded, int circuitOpen) {
    return Row(
      children: [
        Expanded(
          child: _buildStatCard(
            '✅ Healthy',
            healthy.toString(),
            Colors.green,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _buildStatCard(
            '⚠️ Degraded',
            degraded.toString(),
            Colors.orange,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _buildStatCard(
            '🔴 Circuit Open',
            circuitOpen.toString(),
            Colors.red,
          ),
        ),
      ],
    );
  }

  Widget _buildStatCard(String label, String value, Color color) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: TextStyle(
              fontSize: 12,
              color: color,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            value,
            style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.bold,
              color: color,
            ),
          ),
        ],
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

  Widget _buildConnectorCard(BuildContext context, ConnectorHealth connector) {
    final statusColor = _getStatusColor(connector.status);
    final errorRate = connector.errorCount > 0 && connector.callCount > 0
        ? (connector.errorCount / connector.callCount * 100).toStringAsFixed(1)
        : '0.0';

    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        connector.connectorId,
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 4),
                      if (connector.lastErrorAt != null)
                        Text(
                          'Last error: ${DateFormat('MMM d, HH:mm').format(connector.lastErrorAt!)}',
                          style: TextStyle(
                            fontSize: 11,
                            color: Colors.grey[600],
                          ),
                        ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: statusColor,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    connector.status.toUpperCase().replaceAll('_', ' '),
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),

            // Metrics
            _buildMetricRow('Uptime', '${connector.uptimePercentage.toStringAsFixed(1)}%'),
            const SizedBox(height: 8),
            _buildMetricRow(
              'Error Rate',
              '$errorRate%',
              alertIfHigh: connector.errorCount > 0 && double.parse(errorRate) > 50,
            ),
            const SizedBox(height: 8),
            _buildMetricRow('P95 Latency', '${connector.p95LatencyMs}ms'),
            const SizedBox(height: 8),
            _buildMetricRow(
              'Calls / Errors',
              '${connector.callCount} / ${connector.errorCount}',
            ),

            if (connector.status == 'circuit_open') ...[
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.red[50],
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.red[200]!),
                ),
                child: Row(
                  children: [
                    Icon(Icons.warning, color: Colors.red[700], size: 20),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Circuit breaker is open. Flows using this connector are paused.',
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.red[700],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],

            if (connector.lastErrorMessage != null && connector.lastErrorMessage!.isNotEmpty) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.grey[100],
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Last Error',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                        color: Colors.grey[600],
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      connector.lastErrorMessage!,
                      style: const TextStyle(fontSize: 12),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildMetricRow(String label, String value, {bool alertIfHigh = false}) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: TextStyle(
            fontSize: 13,
            color: Colors.grey[600],
          ),
        ),
        Text(
          value,
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: alertIfHigh ? Colors.red : Colors.grey[800],
          ),
        ),
      ],
    );
  }

  Color _getStatusColor(String status) {
    switch (status) {
      case 'healthy':
        return Colors.green;
      case 'degraded':
        return Colors.orange;
      case 'circuit_open':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }
}

class ConnectorHealth {
  final String connectorId;
  final String status;
  final double errorRate;
  final int callCount;
  final int errorCount;
  final DateTime? lastErrorAt;
  final String? lastErrorMessage;
  final int p95LatencyMs;
  final double uptimePercentage;

  ConnectorHealth({
    required this.connectorId,
    required this.status,
    required this.errorRate,
    required this.callCount,
    required this.errorCount,
    required this.lastErrorAt,
    required this.lastErrorMessage,
    required this.p95LatencyMs,
    required this.uptimePercentage,
  });

  factory ConnectorHealth.fromJson(Map<String, dynamic> json) {
    return ConnectorHealth(
      connectorId: json['connector_id'] as String? ?? 'Unknown',
      status: json['status'] as String? ?? 'healthy',
      errorRate: (json['error_rate'] as num?)?.toDouble() ?? 0.0,
      callCount: json['call_count'] as int? ?? 0,
      errorCount: json['error_count'] as int? ?? 0,
      lastErrorAt: json['last_error_at'] != null
          ? DateTime.parse(json['last_error_at'] as String)
          : null,
      lastErrorMessage: json['last_error_message'] as String?,
      p95LatencyMs: json['p95_latency_ms'] as int? ?? 0,
      uptimePercentage: (json['uptime_percentage'] as num?)?.toDouble() ?? 100.0,
    );
  }
}
