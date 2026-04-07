import requests

with open("test_audio.wav", "rb") as f:
    resp = requests.post(
        "http://localhost:8000/api/analyze",
        files={"file": ("test.wav", f, "audio/wav")},
        timeout=120,
    )

print("Status:", resp.status_code)
if resp.status_code == 200:
    d = resp.json()
    em = d["emotion"]
    intent = d["intent"]
    print(f"Emotion: {em['prediction']} ({em['confidence']:.2%})")
    print(f"Intent: {intent['combined']}")
    print(f"Duration: {d['duration']}s")
    print("All emotion scores:", em["all_scores"])
else:
    print("Error:", resp.text[:500])
