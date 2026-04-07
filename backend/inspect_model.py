import torch, json
from pathlib import Path

MODEL_PATH = Path(__file__).parent.parent / "best_joint_model.pt"
ckpt = torch.load(str(MODEL_PATH), map_location="cpu", weights_only=False)
sd = ckpt.get("model_state_dict", {})

lines = []
for k in sorted(sd.keys()):
    if not k.startswith("wav2vec2."):
        lines.append({"key": k, "shape": list(sd[k].shape)})

result = {
    "heads": lines,
    "num_actions": ckpt.get("num_actions"),
    "num_objects": ckpt.get("num_objects"),  
    "num_emotions": ckpt.get("num_emotions"),
}

with open("heads_clean.json", "w", encoding="utf-8") as f:
    json.dump(result, f, indent=2)
print("DONE")
