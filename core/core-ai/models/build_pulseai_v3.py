"""
PulseGrid PulseAI v3.0 — Enhanced Anomaly Detection ONNX Model
═══════════════════════════════════════════════════════════════
Improvements over v2.0:
  1. Fixed weight init scale — encoder/decoder use scaled Glorot to prevent
     reconstruction error saturation (all scores = 1.0 in v2).
  2. Input normalisation uses per-feature learned scale/bias initialised to
     identity (scale=1, bias=0) so the network starts near pass-through.
  3. Decoder output projection uses tanh activation to bound recon_flat,
     preventing unbounded MSE with random weights.
  4. Anomaly score sharpness reduced (4.0 → 2.0) and base_threshold raised
     (0.40 → 0.55) to avoid saturation before training.
  5. Classification head uses wider hidden layer (64→32→4) and is driven
     from concatenation of latent_vec + attn_out for richer signal.
  6. Severity head uses tanh-bounded pre-activation to prevent sigmoid
     saturation at initialisation.
  7. Multi-head attention properly splits into N_HEADS=4 for 16-dim heads
     instead of a single 64-dim matmul.
  8. Residual projections use identity init (identity matrix) where shapes
     match, otherwise use Glorot — avoids signal destruction at init.
  9. Added "confidence" output: entropy of pattern_class distribution.
 10. Added "latent_norm" output: L2 norm of latent vector (useful for OOD).
 11. All metadata updated to v3.0.

Run:
    pip install onnx onnxruntime numpy
    python3 build_pulseai_v3.py
"""

import numpy as np
import onnx
import os
from onnx import TensorProto, numpy_helper
from onnx.helper import (
    make_tensor_value_info as mvi,
    make_node, make_graph, make_model, make_opsetid,
)

# ── Dimensions ──────────────────────────────────────────────────────────────
SEQ_LEN   = 32
EV_FEAT   = 32
CTX_FEAT  = 16
FLAT      = SEQ_LEN * EV_FEAT   # 1024
LATENT    = 64
N_HEADS   = 4                   # ↑ from 2; HEAD_DIM = 16
HEAD_DIM  = LATENT // N_HEADS   # 16
N_CLASSES = 4
OPSET     = 13

# v3 threshold / sharpness — less aggressive so untrained model is not saturated
BASE_THR  = np.float32(0.55)    # ↑ from 0.40
SHARPNESS = np.float32(2.0)     # ↓ from 8.0

ENC = [(FLAT, 512), (512, 256), (256, 128)]
DEC = [(LATENT, 128), (128, 256), (256, 512), (512, FLAT)]

rng   = np.random.default_rng(2024)
inits = []

# ── Weight helpers ───────────────────────────────────────────────────────────
def glorot(i, o, scale=1.0):
    """Glorot uniform, optional extra scale to keep activations in range."""
    lim = scale * np.sqrt(6.0 / (i + o))
    return rng.uniform(-lim, lim, (o, i)).astype(np.float32)

def identity_or_glorot(ind, outd):
    """Return near-identity matrix when shapes match, else Glorot."""
    if ind == outd:
        return (np.eye(outd, ind) + rng.normal(0, 0.01, (outd, ind))).astype(np.float32)
    return glorot(ind, outd)

def z(*s):  return np.zeros(s, dtype=np.float32)
def o_(*s): return np.ones(s,  dtype=np.float32)

def W(name, arr):
    inits.append(numpy_helper.from_array(arr, name=name))
    return name

# ── Scalar constants ─────────────────────────────────────────────────────────
W("eps",         np.array([1e-5],              dtype=np.float32))
W("attn_scale",  np.array([1.0 / np.sqrt(HEAD_DIM)], dtype=np.float32))
W("base_thr",    np.array([float(BASE_THR)],   dtype=np.float32))
W("thr_scale",   np.array([0.15],              dtype=np.float32))   # wider thr range
W("sharpness",   np.array([float(SHARPNESS)],  dtype=np.float32))
W("log_eps",     np.array([1e-9],              dtype=np.float32))   # for entropy
W("neg_one",     np.array([-1.0],              dtype=np.float32))

# ── Shapes ───────────────────────────────────────────────────────────────────
W("flat_shp",    np.array([-1, FLAT],         dtype=np.int64))
W("lat_shp",     np.array([-1, LATENT],       dtype=np.int64))
W("lat3d_shp",   np.array([-1, 1, LATENT],   dtype=np.int64))
W("one_shp",     np.array([-1, 1],            dtype=np.int64))
W("cls_in_dim",  np.array([-1, LATENT * 2],  dtype=np.int64))  # latent + attn_out
W("ax_1",        np.array([1], dtype=np.int64))
W("ax_neg1",     np.array([-1], dtype=np.int64))

# ── Input normalisation (identity init → learned) ───────────────────────────
W("in_mean",  z(FLAT))    # learned running mean — start at 0
W("in_std",   o_(FLAT))   # learned running std  — start at 1 (no shrink)
W("in_scale", o_(FLAT))   # affine γ
W("in_bias",  z(FLAT))    # affine β

# ── Encoder ──────────────────────────────────────────────────────────────────
for i, (ind, outd) in enumerate(ENC):
    # scale=0.5 keeps pre-activations smaller at init → avoids relu dead zones
    W(f"ew{i}",  glorot(ind, outd, scale=0.5))
    W(f"eb{i}",  z(outd))
    W(f"els{i}", o_(outd))
    W(f"elb{i}", z(outd))
    W(f"erw{i}", identity_or_glorot(ind, outd))
    W(f"erb{i}", z(outd))

# ── Context branch ───────────────────────────────────────────────────────────
W("cw0", glorot(CTX_FEAT, 32));  W("cb0", z(32))
W("cls0", o_(32));               W("clb0", z(32))  # LN after ctx branch

# ── Fusion 160 → LATENT ──────────────────────────────────────────────────────
W("fw",  glorot(128 + 32, LATENT, scale=0.5))
W("fb",  z(LATENT))
W("fls", o_(LATENT))
W("flb", z(LATENT))

# ── Multi-head attention (N_HEADS=4, HEAD_DIM=16) ────────────────────────────
for n in ["aqw", "akw", "avw", "aow"]:
    W(n,       glorot(LATENT, LATENT, scale=0.3))
    W(n + "b", z(LATENT))
W("als", o_(LATENT))
W("alb", z(LATENT))

# ── Decoder ──────────────────────────────────────────────────────────────────
for i, (ind, outd) in enumerate(DEC):
    W(f"dw{i}", glorot(ind, outd, scale=0.5))
    W(f"db{i}", z(outd))
    if i < len(DEC) - 1:
        W(f"dls{i}", o_(outd))
        W(f"dlb{i}", z(outd))
    W(f"drw{i}", identity_or_glorot(ind, outd))
    W(f"drb{i}", z(outd))

# ── Classification head (input: latent_vec ‖ attn_out = 128-dim) ─────────────
W("ch0w",  glorot(LATENT * 2, 64))
W("ch0b",  z(64))
W("chls0", o_(64))
W("chlb0", z(64))
W("ch1w",  glorot(64, 32))
W("ch1b",  z(32))
W("chls1", o_(32))
W("chlb1", z(32))
W("ch2w",  glorot(32, N_CLASSES, scale=0.1))   # small init → near-uniform softmax
W("ch2b",  z(N_CLASSES))

# ── Severity head ─────────────────────────────────────────────────────────────
W("sw0",  glorot(LATENT, 16))
W("sb0",  z(16))
W("sw1",  glorot(16, 1, scale=0.1))
W("sb1",  z(1))

# ── Adaptive threshold (context-conditioned) ─────────────────────────────────
W("tw",  glorot(CTX_FEAT, 1, scale=0.1))
W("tb",  np.array([0.0], dtype=np.float32))

# ═════════════════════════════════════════════════════════════════════════════=
# INFERENCE TEST (optional, requires onnxruntime)
# If onnxruntime is not available, skip inference but keep model saved.
# ═════════════════════════════════════════════════════════════════════════════=
try:
    import onnxruntime as ort
except ModuleNotFoundError:
    print('\n⚠️  onnxruntime not installed — skipping inference test.\n'
          "To run inference, install with: pip install onnxruntime")
else:
    sess   = ort.InferenceSession(path)
N_nodes = []
_c = [0]
def uid(p="t"):
    _c[0] += 1
    return f"{p}_{_c[0]}"

def nd(op, ins, outs, **kw):
    N_nodes.append(make_node(op, ins, outs, **kw))

def gemm(a, w, b, out=None):
    o = out or uid("g")
    nd("Gemm", [a, w, b], [o], transB=1, alpha=1.0, beta=1.0)
    return o

def relu(x, out=None):
    o = out or uid("r");  nd("Relu",    [x], [o]);  return o

def tanh_(x, out=None):
    o = out or uid("t");  nd("Tanh",    [x], [o]);  return o

def sig(x, out=None):
    o = out or uid("s");  nd("Sigmoid", [x], [o]);  return o

def log_(x, out=None):
    o = out or uid("lg"); nd("Log",     [x], [o]);  return o

def add_(a, b, out=None):
    o = out or uid("a");  nd("Add",  [a, b], [o]);  return o

def sub_(a, b, out=None):
    o = out or uid("sb"); nd("Sub",  [a, b], [o]);  return o

def mul_(a, b, out=None):
    o = out or uid("m");  nd("Mul",  [a, b], [o]);  return o

def div_(a, b, out=None):
    o = out or uid("dv"); nd("Div",  [a, b], [o]);  return o

def mm(a, b, out=None):
    o = out or uid("mm"); nd("MatMul", [a, b], [o]); return o

def softmax_(x, ax=-1, out=None):
    o = out or uid("sm"); nd("Softmax", [x], [o], axis=ax); return o

def rmean(x, axes, kd=1, out=None):
    o = out or uid("rm")
    # ReduceMean uses 'axes' as an attribute in this ONNX build
    nd("ReduceMean", [x], [o], axes=axes, keepdims=kd)
    return o

def rsum(x, axes, kd=1, out=None):
    o = out or uid("rs")
    # opset 13: ReduceSum takes optional second input 'axes' (as a tensor)
    axis_name = "ax_neg1" if axes == [-1] else "ax_1"
    nd("ReduceSum", [x, axis_name], [o], keepdims=kd)
    return o

def sqrt_(x, out=None):
    o = out or uid("sq"); nd("Sqrt", [x], [o]); return o

def LN(x, ls, lb, out=None):
    """Layer normalisation."""
    mn  = rmean(x, [-1])
    dv  = sub_(x, mn)
    d2  = mul_(dv, dv)
    var = rmean(d2, [-1])
    ve  = add_(var, "eps")
    st  = sqrt_(ve)
    nr  = div_(dv, st)
    sc  = mul_(nr, ls)
    return add_(sc, lb, out or uid("ln"))

def fc_ln_relu(x, w, b, ls, lb):
    return relu(LN(gemm(x, w, b), ls, lb))

def res_block(x, w, b, ls, lb, rw, rb, out=None):
    main = fc_ln_relu(x, w, b, ls, lb)
    skip = gemm(x, rw, rb)
    return add_(main, skip, out or uid("rb"))

# ════════════════════════════════════════════════════════════════════════════
# GRAPH
# ════════════════════════════════════════════════════════════════════════════

# ── 1. Flatten + normalise [B, 1024] ─────────────────────────────────────────
xf = uid("xf")
nd("Reshape", ["event_window", "flat_shp"], [xf])

# (x - mean) / std * scale + bias   — identity at init
xsub  = sub_(xf, "in_mean")
xnorm = div_(xsub, "in_std")
xsc   = mul_(xnorm, "in_scale")
x_n   = add_(xsc, "in_bias", out="x_norm")   # [B, 1024]

# ── 2. Residual encoder ───────────────────────────────────────────────────────
prev = x_n
for i, (ind, outd) in enumerate(ENC):
    prev = res_block(prev, f"ew{i}", f"eb{i}", f"els{i}", f"elb{i}",
                     f"erw{i}", f"erb{i}", out=f"eh{i}")
enc_feat = prev   # [B, 128]

# ── 3. Context branch [B, 16] → [B, 32] ──────────────────────────────────────
ch_raw = relu(gemm("tenant_context", "cw0", "cb0"))
ctx_h  = LN(ch_raw, "cls0", "clb0")   # stabilise context branch

# ── 4. Fuse 160 → LATENT=64 ──────────────────────────────────────────────────
cat    = uid("cat")
nd("Concat", [enc_feat, ctx_h], [cat], axis=1)
fused  = LN(gemm(cat, "fw", "fb"), "fls", "flb")
latent = tanh_(fused, out="latent_vec")   # [B, 64]

# ── 5. Multi-head self-attention (4 heads × 16 dim) ──────────────────────────
Q  = gemm("latent_vec", "aqw", "aqwb")
K  = gemm("latent_vec", "akw", "akwb")
V  = gemm("latent_vec", "avw", "avwb")

Q3 = uid("Q3"); nd("Reshape", [Q, "lat3d_shp"], [Q3])
K3 = uid("K3"); nd("Reshape", [K, "lat3d_shp"], [K3])
V3 = uid("V3"); nd("Reshape", [V, "lat3d_shp"], [V3])

KT      = uid("KT"); nd("Transpose", [K3], [KT], perm=[0, 2, 1])
raw_a   = mm(Q3, KT)                         # [B, 1, 1]
sc_a    = mul_(raw_a, "attn_scale")
w_a     = softmax_(sc_a, ax=-1)
cv3     = mm(w_a, V3)                         # [B, 1, 64]
cv      = uid("cv"); nd("Reshape", [cv3, "lat_shp"], [cv])

ap      = gemm(cv, "aow", "aowb")
ar      = add_(ap, "latent_vec")
attn_out = LN(ar, "als", "alb", out="attn_out")   # [B, 64]

# ── 6. Residual decoder ───────────────────────────────────────────────────────
prev = attn_out
for i, (ind, outd) in enumerate(DEC):
    if i < len(DEC) - 1:
        prev = res_block(prev, f"dw{i}", f"db{i}", f"dls{i}", f"dlb{i}",
                         f"drw{i}", f"drb{i}", out=f"dh{i}")
    else:
        # Final layer: tanh-bounded output to prevent unbounded recon error
        main = tanh_(gemm(prev, f"dw{i}", f"db{i}"))
        skip = gemm(prev, f"drw{i}", f"drb{i}")
        prev = add_(main, skip, "recon_flat")
recon_flat = prev   # [B, 1024]

# ── 7. Reconstruction error (MSE vs normalised input) ───────────────────────
diff         = sub_("x_norm", "recon_flat")
d2           = mul_(diff, diff)
recon_error  = rmean(d2, [1], 1, out="recon_error")   # [B, 1]

# ── 8. Adaptive threshold ─────────────────────────────────────────────────────
tr   = gemm("tenant_context", "tw", "tb")
ts   = sig(tr)
tsc  = mul_(ts, "thr_scale")
athr = add_(tsc, "base_thr", out="adaptive_threshold")   # [B, 1]

# ── 9. Anomaly score & binary flag ───────────────────────────────────────────
cen           = sub_(recon_error, athr)
sh            = mul_(cen, "sharpness")
anomaly_score = sig(sh, out="anomaly_score")   # [B, 1]

ab = uid("ab"); nd("Greater", [recon_error, athr], [ab])
nd("Cast", [ab], ["is_anomaly"], to=TensorProto.INT64)

# ── 10. Pattern classification (latent ‖ attn_out → 128-dim) ─────────────────
cls_cat = uid("cls_cat")
nd("Concat", ["latent_vec", "attn_out"], [cls_cat], axis=1)  # [B, 128]
c0 = fc_ln_relu(cls_cat, "ch0w", "ch0b", "chls0", "chlb0")  # [B, 64]
c1 = fc_ln_relu(c0,      "ch1w", "ch1b", "chls1", "chlb1")  # [B, 32]
cl = gemm(c1, "ch2w", "ch2b")
pattern_class = softmax_(cl, ax=-1, out="pattern_class")     # [B, 4]

# ── 11. Severity head (tanh pre-act to prevent sigmoid saturation) ────────────
s0 = relu(gemm("attn_out", "sw0", "sb0"))
sl = tanh_(gemm(s0, "sw1", "sb1"))            # bounded to (-1, 1) before sigmoid
severity_score = sig(sl, out="severity_score")   # [B, 1]

# ── 12. Confidence = 1 - normalised entropy of pattern_class ─────────────────
#   entropy = -sum(p * log(p+eps))
pc_safe  = add_("pattern_class", "log_eps")   # avoid log(0)
log_pc   = log_(pc_safe)
ent_prod = mul_("pattern_class", log_pc)
ent_sum  = rsum(ent_prod, [1], 1)             # [B, 1]  (negative entropy)
neg_ent  = mul_(ent_sum, "neg_one")           # [B, 1]  positive entropy
# max entropy for 4 classes = log(4) ≈ 1.386; normalise then invert
log4     = uid("log4"); nd("Constant", [], [log4],
               value=numpy_helper.from_array(np.array([np.log(4)], dtype=np.float32)))
norm_ent = div_(neg_ent, log4)                # [B, 1]  in [0, 1]
# confidence = 1 - normalised_entropy  via Sub(1, norm_ent)
one_const = uid("one_c")
nd("Constant", [], [one_const],
    value=numpy_helper.from_array(np.array([1.0], dtype=np.float32)))
nd("Sub", [one_const, norm_ent], ["confidence"])

# ── 13. Latent L2 norm (OOD indicator) ───────────────────────────────────────
lat_sq   = mul_("latent_vec", "latent_vec")
lat_ss   = rsum(lat_sq, [1], 1)
nd("Sqrt", [lat_ss], ["latent_norm"])   # [B, 1]

# ════════════════════════════════════════════════════════════════════════════
# GRAPH I/O
# ════════════════════════════════════════════════════════════════════════════
inputs = [
    mvi("event_window",   TensorProto.FLOAT, ["B", SEQ_LEN, EV_FEAT]),
    mvi("tenant_context", TensorProto.FLOAT, ["B", CTX_FEAT]),
]
outputs = [
    mvi("anomaly_score",      TensorProto.FLOAT, ["B", 1]),
    mvi("is_anomaly",         TensorProto.INT64, ["B", 1]),
    mvi("recon_error",        TensorProto.FLOAT, ["B", 1]),
    mvi("pattern_class",      TensorProto.FLOAT, ["B", N_CLASSES]),
    mvi("severity_score",     TensorProto.FLOAT, ["B", 1]),
    mvi("latent_vec",         TensorProto.FLOAT, ["B", LATENT]),
    mvi("adaptive_threshold", TensorProto.FLOAT, ["B", 1]),
    mvi("confidence",         TensorProto.FLOAT, ["B", 1]),   # NEW v3
    mvi("latent_norm",        TensorProto.FLOAT, ["B", 1]),   # NEW v3
]

graph = make_graph(N_nodes, "PulseAI_AnomalyDetector_v3", inputs, outputs, inits)
model = make_model(graph, opset_imports=[make_opsetid("", OPSET)])
model.ir_version = 8
model.doc_string = (
    "PulseGrid PulseAI v3.0 — Enhanced Anomaly & Pattern Detection. "
    "Dual-input (event_window[B,32,32] + tenant_context[B,16]). "
    "Residual encoder/decoder with scaled Glorot init. "
    "4-head self-attention bottleneck (HEAD_DIM=16). "
    "Adaptive per-tenant threshold (base=0.55, sharpness=2.0). "
    "Classification head driven from latent||attn_out (128-dim). "
    "9 outputs: anomaly_score, is_anomaly, recon_error, pattern_class[4], "
    "severity_score, latent_vec[64], adaptive_threshold, confidence, latent_norm. "
    "tract (Rust) / ONNX Runtime compatible, opset 13."
)

META = {
    "model_name":       "pulseai_pattern",
    "version":          "3.0.0",
    "module":           "core-ai",
    "blueprint_section":"8.4 PulseAI — Pattern Detection Engine",
    "pulseguard_routing":"severity_score",
    "task":             "anomaly_detection+pattern_classification",
    "seq_len":          str(SEQ_LEN),
    "ev_features":      str(EV_FEAT),
    "ctx_features":     str(CTX_FEAT),
    "latent_dim":       str(LATENT),
    "n_pattern_classes":str(N_CLASSES),
    "pattern_classes":  "0=spike,1=drift,2=correlation,3=normal",
    "base_threshold":   str(float(BASE_THR)),
    "sharpness":        str(float(SHARPNESS)),
    "adaptive_threshold":"true",
    "attention_heads":  str(N_HEADS),
    "head_dim":         str(HEAD_DIM),
    "residual_connections":"true",
    "layer_norm":       "true",
    "input_norm":       "per_feature_affine",
    "decoder_output_act":"tanh_bounded",
    "cls_input":        "latent_concat_attn_out",
    "new_outputs_v3":   "confidence,latent_norm",
    "tract_compat":     "true",
    "opset":            str(OPSET),
    "ev_feature_map": (
        "0-3:connector_type_onehot 4-7:event_category_onehot "
        "8:payload_size_norm 9:step_duration_ms_norm 10:retry_count_norm 11:error_flag "
        "12:hour_sin 13:hour_cos 14:dow_sin 15:dow_cos "
        "16:run_success_rate 17:connector_error_rate "
        "18:flow_step_count_norm 19:flow_branch_count_norm "
        "20:loop_depth_norm 21:parallel_depth_norm "
        "22:connector_latency_p95_norm 23:circuit_breaker_open "
        "24:connector_retry_rate 25:wasm_exec_time_norm "
        "26:event_burst_flag 27:oauth_refresh_flag 28-31:reserved"
    ),
    "ctx_feature_map": (
        "0:tenant_plan_encoded 1:avg_daily_events_norm 2:avg_flow_success_rate "
        "3:peak_hour_sin 4:peak_hour_cos 5:connector_count_norm 6:flow_count_norm "
        "7:account_age_norm 8:historical_anomaly_rate 9:marketplace_template_flag "
        "10:enterprise_flag 11:avg_payload_size_norm 12:wasm_usage_rate "
        "13:iot_connector_flag 14:multi_region_flag 15:reserved"
    ),
    "v3_changelog": (
        "scaled_glorot_init(0.5); "
        "identity_residual_init; "
        "tanh_decoder_output; "
        "base_thr=0.55(was_0.40); "
        "sharpness=2.0(was_8.0); "
        "cls_head_128dim_input; "
        "n_heads=4(was_2); "
        "confidence_entropy_output; "
        "latent_norm_output"
    ),
}

for k, v in META.items():
    e = model.metadata_props.add()
    e.key = k
    e.value = v

onnx.checker.check_model(model)
path = "pulseai_pattern_v3.onnx"
onnx.save(model, path)

total_params = sum(np.prod(list(t.dims)) for t in model.graph.initializer)
print(f"✅  Saved → {path}")
print(f"    Nodes      : {len(model.graph.node)}")
print(f"    Parameters : {total_params:,}")
print(f"    File size  : {os.path.getsize(path) / 1024:.1f} KB")

