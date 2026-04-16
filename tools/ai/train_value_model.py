import argparse
import json
import hashlib
import math
import random
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DATASET = ROOT / "tmp" / "ai" / "selfplay_dataset.jsonl"
DEFAULT_MODEL = ROOT / "src" / "server" / "ai" / "model" / "value-model.json"
FEATURE_ORDER_PATH = ROOT / "src" / "server" / "ai" / "model" / "feature-order.json"


def load_feature_order():
    with FEATURE_ORDER_PATH.open("r", encoding="utf8") as handle:
        return json.load(handle)


def stable_split(seed: str) -> str:
    digest = hashlib.md5(seed.encode("utf8")).hexdigest()
    bucket = int(digest[:8], 16) % 10
    return "val" if bucket == 0 else "train"


def load_dataset(path: Path, feature_order):
    rows = []
    with path.open("r", encoding="utf8") as handle:
        for raw in handle:
            raw = raw.strip()
            if not raw:
                continue
            item = json.loads(raw)
            features = item.get("features", {})
            vector = [float(features.get(name, 0.0)) for name in feature_order]
            rows.append({
                "seed": str(item.get("seed", "")),
                "x": vector,
                "y": float(item.get("targetValue", 0.0)),
            })
    return rows


def vector_mean(matrix):
    count = len(matrix)
    size = len(matrix[0])
    return [sum(row[i] for row in matrix) / count for i in range(size)]


def vector_std(matrix, mean):
    count = len(matrix)
    size = len(matrix[0])
    out = []
    for i in range(size):
      variance = sum((row[i] - mean[i]) ** 2 for row in matrix) / count
      out.append(math.sqrt(variance) if variance > 1e-18 else 1.0)
    return out


def normalize_rows(matrix, mean, std):
    return [
        [(row[i] - mean[i]) / (std[i] if abs(std[i]) > 1e-9 else 1.0) for i in range(len(row))]
        for row in matrix
    ]


def tanh_derivative(value):
    return 1.0 - (value * value)


def mse(predictions, targets):
    total = 0.0
    for pred, target in zip(predictions, targets):
        diff = pred - target
        total += diff * diff
    return total / max(1, len(predictions))


def forward_sample(vector, w1, b1, w2, b2):
    hidden = []
    for j in range(len(b1)):
        total = b1[j]
        for i, value in enumerate(vector):
            total += value * w1[i][j]
        hidden.append(math.tanh(total))
    output = b2[0]
    for j, value in enumerate(hidden):
        output += value * w2[j][0]
    return hidden, output


def evaluate_loss(dataset_x, dataset_y, w1, b1, w2, b2):
    predictions = []
    for vector in dataset_x:
        _, pred = forward_sample(vector, w1, b1, w2, b2)
        predictions.append(pred)
    return mse(predictions, dataset_y)


def train(rows, feature_order, hidden_size, epochs, learning_rate, eval_interval, patience):
    if not rows:
        raise ValueError("Dataset is empty.")

    train_rows = [row for row in rows if stable_split(row["seed"]) == "train"]
    val_rows = [row for row in rows if stable_split(row["seed"]) == "val"]
    if not val_rows:
        val_rows = train_rows[:max(1, len(train_rows) // 10)]
    if not train_rows:
        train_rows = val_rows

    x_train = [row["x"][:] for row in train_rows]
    y_train = [row["y"] for row in train_rows]
    x_val = [row["x"][:] for row in val_rows]
    y_val = [row["y"] for row in val_rows]

    mean = vector_mean(x_train)
    std = vector_std(x_train, mean)
    x_train_norm = normalize_rows(x_train, mean, std)
    x_val_norm = normalize_rows(x_val, mean, std)

    rng = random.Random(42)
    input_size = len(feature_order)
    w1 = [[rng.uniform(-0.08, 0.08) for _ in range(hidden_size)] for _ in range(input_size)]
    b1 = [0.0 for _ in range(hidden_size)]
    w2 = [[rng.uniform(-0.08, 0.08)] for _ in range(hidden_size)]
    b2 = [0.0]

    best_snapshot = None
    best_val_loss = float("inf")
    epochs_without_improvement = 0

    for epoch in range(epochs):
        paired = list(zip(x_train_norm, y_train))
        rng.shuffle(paired)
        grad_w1 = [[0.0 for _ in range(hidden_size)] for _ in range(input_size)]
        grad_b1 = [0.0 for _ in range(hidden_size)]
        grad_w2 = [[0.0] for _ in range(hidden_size)]
        grad_b2 = [0.0]

        sample_count = max(1, len(x_train_norm))
        for vector, target in paired:
            hidden, pred = forward_sample(vector, w1, b1, w2, b2)
            d_pred = (2.0 / sample_count) * (pred - target)
            for j in range(hidden_size):
                grad_w2[j][0] += hidden[j] * d_pred
            grad_b2[0] += d_pred

            for j in range(hidden_size):
                d_hidden = d_pred * w2[j][0] * tanh_derivative(hidden[j])
                grad_b1[j] += d_hidden
                for i in range(input_size):
                    grad_w1[i][j] += vector[i] * d_hidden

        for i in range(input_size):
            for j in range(hidden_size):
                w1[i][j] -= learning_rate * grad_w1[i][j]
        for j in range(hidden_size):
            b1[j] -= learning_rate * grad_b1[j]
            w2[j][0] -= learning_rate * grad_w2[j][0]
        b2[0] -= learning_rate * grad_b2[0]

        should_evaluate = (
            epoch == 0
            or (epoch + 1) == epochs
            or ((epoch + 1) % max(1, eval_interval) == 0)
        )
        if should_evaluate:
            train_loss = evaluate_loss(x_train_norm, y_train, w1, b1, w2, b2)
            val_loss = evaluate_loss(x_val_norm, y_val, w1, b1, w2, b2)
            if val_loss < best_val_loss:
                best_val_loss = val_loss
                epochs_without_improvement = 0
                best_snapshot = {
                    "w1": [row[:] for row in w1],
                    "b1": b1[:],
                    "w2": [row[:] for row in w2],
                    "b2": b2[:],
                    "trainLoss": train_loss,
                    "validationLoss": val_loss,
                    "bestEpoch": epoch + 1,
                }
            else:
                epochs_without_improvement += 1

            if patience > 0 and epochs_without_improvement >= patience:
                break

    return {
        "feature_order": feature_order,
        "normalization": {
            "mean": mean,
            "std": std,
        },
        "layers": [
            {
                "weights": best_snapshot["w1"],
                "bias": best_snapshot["b1"],
            },
            {
                "weights": best_snapshot["w2"],
                "bias": best_snapshot["b2"],
            },
        ],
        "metrics": {
            "trainLoss": best_snapshot["trainLoss"],
            "validationLoss": best_snapshot["validationLoss"],
            "trainCount": len(train_rows),
            "validationCount": len(val_rows),
            "bestEpoch": best_snapshot["bestEpoch"],
        },
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", default=str(DEFAULT_DATASET))
    parser.add_argument("--out", default=str(DEFAULT_MODEL))
    parser.add_argument("--hidden-size", type=int, default=16)
    parser.add_argument("--epochs", type=int, default=600)
    parser.add_argument("--learning-rate", type=float, default=0.01)
    parser.add_argument("--eval-interval", type=int, default=5)
    parser.add_argument("--patience", type=int, default=24)
    args = parser.parse_args()

    dataset_path = Path(args.dataset)
    out_path = Path(args.out)
    feature_order = load_feature_order()
    rows = load_dataset(dataset_path, feature_order)
    trained = train(
        rows,
        feature_order,
        args.hidden_size,
        args.epochs,
        args.learning_rate,
        args.eval_interval,
        args.patience,
    )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    model = {
        "version": 2,
        "modelType": "mlp_tanh_v1",
        "featureOrder": trained["feature_order"],
        "normalization": trained["normalization"],
        "layers": trained["layers"],
        "metrics": trained["metrics"],
        "trainedAt": datetime.now(timezone.utc).isoformat(),
        "datasetMeta": {
            "path": str(dataset_path),
            "sampleCount": len(rows),
        },
    }
    with out_path.open("w", encoding="utf8") as handle:
        json.dump(model, handle, ensure_ascii=False, indent=2)

    print(json.dumps({
        "ok": True,
        "dataset": str(dataset_path),
        "out": str(out_path),
        "sampleCount": len(rows),
        "trainLoss": trained["metrics"]["trainLoss"],
        "validationLoss": trained["metrics"]["validationLoss"],
    }))


if __name__ == "__main__":
    main()
