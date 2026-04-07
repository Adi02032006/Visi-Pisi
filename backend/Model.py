"""
JointSpeechModel — Wav2Vec2-base backbone for joint intent + emotion recognition.

Architecture (from checkpoint inspection):
  - Backbone: facebook/wav2vec2-base (768 hidden dim)
  - Frozen: CNN feature extractor + transformer layers 0-5
  - Trainable: transformer layers 6-11
  - Pooling: StatPooling (mean + std concatenated → 1536)
  
  - Intent Head (intent_head):
      shared.0: Linear(1536, 512) → ReLU → Dropout
      action_classifier: Linear(512, num_actions)
      object_classifier: Linear(512, num_objects)
  
  - Emotion Head (emotion_head):
      classifier.0: Linear(1536, 256) → ReLU → Dropout
      classifier.3: Linear(256, num_emotions)
"""

import torch
import torch.nn as nn
from transformers import Wav2Vec2Model


class StatPooling(nn.Module):
    """Mean + Std pooling → concatenation (1536-dim output for wav2vec2-base)."""

    def forward(self, x: torch.Tensor, mask: torch.Tensor | None = None):
        # x: (B, T, D)
        if mask is not None:
            mask = mask.unsqueeze(-1)  # (B, T, 1)
            lengths = mask.sum(dim=1).clamp(min=1)  # (B, 1)
            mean = (x * mask).sum(dim=1) / lengths
            std = torch.sqrt(((x - mean.unsqueeze(1)) ** 2 * mask).sum(dim=1) / lengths + 1e-8)
        else:
            mean = x.mean(dim=1)
            std = x.std(dim=1)
        return torch.cat([mean, std], dim=-1)  # (B, 2D)


class IntentHead(nn.Module):
    def __init__(self, input_dim: int, num_actions: int, num_objects: int):
        super().__init__()
        self.shared = nn.Sequential(
            nn.Linear(input_dim, 512),
            nn.ReLU(),
            nn.Dropout(0.3),
        )
        self.action_classifier = nn.Linear(512, num_actions)
        self.object_classifier = nn.Linear(512, num_objects)

    def forward(self, x):
        h = self.shared(x)
        return self.action_classifier(h), self.object_classifier(h)


class EmotionHead(nn.Module):
    def __init__(self, input_dim: int, num_emotions: int):
        super().__init__()
        self.classifier = nn.Sequential(
            nn.Linear(input_dim, 256),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(256, num_emotions),
        )

    def forward(self, x):
        return self.classifier(x)


class JointSpeechModel(nn.Module):
    def __init__(self, num_actions: int, num_objects: int, num_emotions: int):
        super().__init__()

        self.wav2vec2 = Wav2Vec2Model.from_pretrained("facebook/wav2vec2-base")
        hidden_size = self.wav2vec2.config.hidden_size  # 768

        # Freeze CNN feature extractor
        self.wav2vec2.feature_extractor._freeze_parameters()

        # Freeze transformer layers 0-5
        for i in range(6):
            for param in self.wav2vec2.encoder.layers[i].parameters():
                param.requires_grad = False

        self.pooling = StatPooling()
        pooled_dim = hidden_size * 2  # 1536

        # Heads — names must match checkpoint keys exactly
        self.intent_head = IntentHead(pooled_dim, num_actions, num_objects)
        self.emotion_head = EmotionHead(pooled_dim, num_emotions)

    def forward(self, input_values, attention_mask=None, task="both"):
        outputs = self.wav2vec2(input_values=input_values, attention_mask=attention_mask)
        hidden_states = outputs.last_hidden_state  # (B, T, 768)

        # Downsample mask to match hidden state length
        if attention_mask is not None:
            output_lengths = self.wav2vec2._get_feat_extract_output_lengths(
                attention_mask.sum(dim=-1).long()
            )
            max_len = hidden_states.shape[1]
            pooling_mask = torch.zeros(
                hidden_states.shape[0], max_len,
                device=hidden_states.device, dtype=hidden_states.dtype
            )
            for i, length in enumerate(output_lengths):
                pooling_mask[i, :length] = 1.0
        else:
            pooling_mask = None

        pooled = self.pooling(hidden_states, pooling_mask)  # (B, 1536)

        action_logits = object_logits = emotion_logits = None

        if task in ("intent", "both"):
            action_logits, object_logits = self.intent_head(pooled)

        if task in ("emotion", "both"):
            emotion_logits = self.emotion_head(pooled)

        if task == "intent":
            return action_logits, object_logits
        elif task == "emotion":
            return emotion_logits
        else:
            return action_logits, object_logits, emotion_logits
