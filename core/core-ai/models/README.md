# PulseAI Pattern Model (Production)

This directory stores the production ONNX model used for PulseGrid pattern detection.

## Active Model

- Model file: `pulseai_pattern_v3.onnx`
- Model version: `3.0.0`
- Runtime: `tract-onnx`

## Finalized Confidence Configuration

- Global confidence threshold: `0.55`
- Spike sensitivity multiplier: `0.75`
- Drift sensitivity multiplier: `0.70`
- Anomaly percentile threshold: `0.95`

These values are enforced by the production v3 analysis pipeline in `core-ai/src/pattern_detection_v3.rs`.

## Versioning Rules

- Breaking feature schema changes require a major version bump.
- Threshold-only tuning uses minor or patch bumps.
- New model binaries should be added as `pulseai_pattern_v{major}.onnx`.

## Monitoring Expectations

The runtime records and surfaces:

- Inference confidence distribution
- Drift score
- Anomaly rate
- Benchmark and canary test results

## Validation

Run benchmark and canary tests with:

```bash
cargo test -p core-ai pattern_detection_v3 -- --nocapture
```
