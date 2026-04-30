import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import 'package:fl_chart/fl_chart.dart';

class AnalyticsScreen extends StatefulWidget {
  const AnalyticsScreen({super.key});

  @override
  State<AnalyticsScreen> createState() => _AnalyticsScreenState();
}

class _AnalyticsScreenState extends State<AnalyticsScreen> {
  final Dio _dio = Dio();
  late Future<AnalyticsData> _analyticsFuture;

  @override
  void initState() {
    super.initState();
    _analyticsFuture = _fetchAnalytics();
  }

  Future<AnalyticsData> _fetchAnalytics() async {
    try {
      final response = await _dio.get('http://localhost:3001/api/v1/analytics/overview');
      final data = response.data as Map<String, dynamic>;
      return AnalyticsData.fromJson(data);
    } catch (e) {
      throw Exception('Failed to load analytics: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Analytics'),
      ),
      body: FutureBuilder<AnalyticsData>(
        future: _analyticsFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(
              child: Text('Error: ${snapshot.error}'),
            );
          }

          final analytics = snapshot.data!;
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              // Run Count Card
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Total Runs',
                        style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        analytics.runCount.toString(),
                        style: const TextStyle(fontSize: 32, fontWeight: FontWeight.bold),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),

              // Success Rate Card
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Success Rate',
                        style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                      ),
                      const SizedBox(height: 8),
                      LinearProgressIndicator(
                        value: analytics.successRate / 100,
                        minHeight: 8,
                        borderRadius: BorderRadius.circular(4),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        '${analytics.successRate.toStringAsFixed(1)}%',
                        style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),

              // Top Connectors Bar Chart
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Top Connectors',
                        style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                      ),
                      const SizedBox(height: 16),
                      SizedBox(
                        height: 300,
                        child: _buildConnectorChart(analytics.topConnectors),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildConnectorChart(List<ConnectorStat> connectors) {
    final List<BarChartGroupData> barGroups = [];
    for (int i = 0; i < connectors.length; i++) {
      barGroups.add(
        BarChartGroupData(
          x: i,
          barRods: [
            BarChartRodData(
              toY: connectors[i].runCount.toDouble(),
              color: Colors.blue,
              width: 16,
            ),
          ],
        ),
      );
    }

    return BarChart(
      BarChartData(
        barGroups: barGroups,
        borderData: FlBorderData(show: false),
        titlesData: FlTitlesData(
          bottomTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              getTitlesWidget: (value, meta) {
                return Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    connectors[value.toInt()].name,
                    style: const TextStyle(fontSize: 12),
                  ),
                );
              },
            ),
          ),
          leftTitles: const AxisTitles(
            sideTitles: SideTitles(showTitles: true),
          ),
          topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
          rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
        ),
      ),
    );
  }
}

class AnalyticsData {
  final int runCount;
  final double successRate;
  final List<ConnectorStat> topConnectors;

  AnalyticsData({
    required this.runCount,
    required this.successRate,
    required this.topConnectors,
  });

  factory AnalyticsData.fromJson(Map<String, dynamic> json) {
    final topConnectors = (json['topConnectors'] as List<dynamic>?)
            ?.map((e) => ConnectorStat.fromJson(e as Map<String, dynamic>))
            .toList() ??
        [];

    return AnalyticsData(
      runCount: json['runCount'] as int? ?? 0,
      successRate: (json['successRate'] as num?)?.toDouble() ?? 0.0,
      topConnectors: topConnectors,
    );
  }
}

class ConnectorStat {
  final String name;
  final int runCount;

  ConnectorStat({required this.name, required this.runCount});

  factory ConnectorStat.fromJson(Map<String, dynamic> json) {
    return ConnectorStat(
      name: json['name'] as String? ?? 'Unknown',
      runCount: json['runCount'] as int? ?? 0,
    );
  }
}
