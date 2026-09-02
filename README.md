# AVR_installation


## Local development

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
export GOOGLE_APPLICATION_CREDENTIALS="/absolute/path/to/service-account.json"
python app.py
```

Open `http://127.0.0.1:5000` for the register or
`http://127.0.0.1:5000/scoreboard` for the scoreboard.

## Render deployment

The included `render.yaml` creates a Python web service using Gunicorn. In the
Render service settings, set `FIREBASE_SERVICE_ACCOUNT_JSON` to the complete
contents of the Firebase service-account JSON file. Never commit that JSON file
or paste it into source code.

The health check endpoint is `/health`.
