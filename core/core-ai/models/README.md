# PulseAI ONNX model

Default model path used by `core-ai`:

- `core/core-ai/models/pulseai_pattern.onnx`

Set `PULSEAI_ONNX_MODEL` to point to a trained ONNX model at runtime.

Expected output format from the model:

- Output tensor with at least 3 float scores
  - index 0: time-based pattern confidence
  - index 1: event-correlation confidence
  - index 2: anomaly confidence

The checked-in `.onnx` file is a placeholder artifact so deployment wiring has a concrete path. Replace it with a real trained model for production inference.
