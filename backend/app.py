from flask import Flask, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

@app.route("/")
def home():
    return "SilentTalk backend running."

@app.route("/voice")
def voice():
    """
    Returns demo data. To enable real Hindi voice recognition,
    uncomment the block below and install:
      pip install SpeechRecognition pyaudio
    """

    # -- REAL VOICE (uncomment to enable) --
    # import speech_recognition as sr, re
    #
    # def extract(text):
    #     d = {}
    #     m = re.search(r"नाम\s+(.+?)\s+है", text)
    #     if m: d["name"] = m.group(1)
    #     m = re.search(r"(\d+)\s*साल", text)
    #     if m: d["age"] = int(m.group(1))
    #     m = re.search(r"(\d+)\s*किलो", text)
    #     if m: d["weight"] = int(m.group(1))
    #     return d
    #
    # r = sr.Recognizer()
    # with sr.Microphone() as src:
    #     r.adjust_for_ambient_noise(src)
    #     audio = r.listen(src, timeout=8)
    # try:
    #     text = r.recognize_google(audio, language="hi-IN")
    #     return jsonify({"text": text, "data": extract(text)})
    # except Exception as e:
    #     return jsonify({"text": "Could not understand", "data": {}, "error": str(e)}), 400

    return jsonify({
        "text": "मेरा नाम Azhan है, मेरी उम्र 25 साल है, मेरा वजन 70 किलो है",
        "data": {"name": "Azhan", "age": 25, "weight": 70}
    })

if __name__ == "__main__":
    app.run(port=5000, debug=True)
