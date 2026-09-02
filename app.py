from __future__ import annotations

from datetime import date
import hashlib
import hmac
import os
import re
from threading import RLock
from time import monotonic
from typing import Any

from flask import Flask, Response, jsonify, redirect, render_template, request, session, url_for
from google.api_core.exceptions import ResourceExhausted

from src.firebase_client import get_firestore_client

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY") or hashlib.sha256(
    f"avr-installation:{os.getenv('APP_PASSWORD', 'local-development')}".encode()
).hexdigest()
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=bool(os.getenv("RENDER")),
)
COLLECTION_NAME = "skylight_installation"
STAGES = {"2000_mm", "1500_mm", "1000_mm"}
DOCUMENT_ID_PATTERN = re.compile(r"installation-[0-9]+")
MAX_INT64 = 2**63 - 1
MAX_REMARKS_LENGTH = 1000
CACHE_TTL_SECONDS = 3600
_installation_cache: tuple[dict[str, Any], ...] | None = None
_cache_loaded_at = 0.0
_cache_lock = RLock()


@app.before_request
def require_production_login() -> Response | None:
    if request.endpoint in {"health", "static", "login"}:
        return None

    expected_password = os.getenv("APP_PASSWORD")
    if not expected_password:
        if os.getenv("RENDER"):
            return Response("APP_PASSWORD is not configured", status=503)
        return None

    if session.get("authenticated") is True:
        return None

    if request.path.startswith("/api/"):
        response = jsonify(
            {"error": "Login expired. Reload the page and sign in again."}
        )
        response.status_code = 401
        return response

    return redirect(url_for("login", next=request.full_path))


@app.route("/login", methods=["GET", "POST"])
def login() -> str | Response:
    error = None
    if request.method == "POST":
        expected_username = os.getenv("APP_USERNAME", "Eddie C")
        expected_password = os.getenv("APP_PASSWORD", "")
        username = request.form.get("username", "")
        password = request.form.get("password", "")
        if (
            expected_password
            and hmac.compare_digest(username, expected_username)
            and hmac.compare_digest(password, expected_password)
        ):
            session.clear()
            session["authenticated"] = True
            destination = request.form.get("next", "/")
            if not destination.startswith("/") or destination.startswith("//"):
                destination = "/"
            return redirect(destination)
        error = "Incorrect username or password."

    return render_template(
        "login.html",
        error=error,
        username=os.getenv("APP_USERNAME", "Eddie C"),
        next_url=request.args.get("next", "/"),
    )


@app.post("/logout")
def logout() -> Response:
    session.clear()
    return redirect(url_for("login"))


def _plan_sort_key(record: dict[str, Any]) -> tuple[int, str]:
    plan_no = str(record.get("plan_no", ""))
    return (int(plan_no), plan_no) if plan_no.isdigit() else (10**9, plan_no)


def load_installations() -> tuple[dict[str, Any], ...]:
    global _cache_loaded_at, _installation_cache

    with _cache_lock:
        if (
            _installation_cache is not None
            and monotonic() - _cache_loaded_at < CACHE_TTL_SECONDS
        ):
            return _installation_cache

        documents = get_firestore_client().collection(COLLECTION_NAME).stream()
        records = (
            {"id": document.id, **document.to_dict()} for document in documents
        )
        _installation_cache = tuple(sorted(records, key=_plan_sort_key))
        _cache_loaded_at = monotonic()
        return _installation_cache


def update_cached_installation(document_id: str, updates: dict[str, Any]) -> None:
    with _cache_lock:
        if _installation_cache is None:
            return
        for record in _installation_cache:
            if record["id"] == document_id:
                record.update(updates)
                return


def update_cached_completion(
    document_id: str, stage: str, completion: dict[str, Any]
) -> None:
    with _cache_lock:
        if _installation_cache is None:
            return
        for record in _installation_cache:
            if record["id"] == document_id:
                record.setdefault("completion", {})[stage] = completion
                return


@app.get("/")
def index() -> str:
    return render_template("index.html")


@app.get("/scoreboard")
def scoreboard() -> str:
    return render_template("scoreboard.html")


@app.get("/health")
def health() -> Any:
    return jsonify({"status": "ok"})


@app.get("/api/installations")
def installations() -> Any:
    try:
        records = load_installations()
    except ResourceExhausted:
        return jsonify(
            {
                "error": (
                    "Firebase read quota is temporarily exhausted. "
                    "Please try again after the daily quota resets."
                )
            }
        ), 503
    return jsonify({"count": len(records), "records": records})


@app.patch("/api/installations/<document_id>/completion/<stage>")
def update_completion(document_id: str, stage: str) -> Any:
    if not DOCUMENT_ID_PATTERN.fullmatch(document_id) or stage not in STAGES:
        return jsonify({"error": "Invalid installation or stage"}), 404

    payload = request.get_json(silent=True) or {}
    done = payload.get("done")
    completion_date = payload.get("date")
    if not isinstance(done, bool):
        return jsonify({"error": "done must be a boolean"}), 400
    if completion_date is not None:
        if not isinstance(completion_date, str):
            return jsonify({"error": "date must use YYYY-MM-DD format"}), 400
        try:
            date.fromisoformat(completion_date)
        except ValueError:
            return jsonify({"error": "date must use YYYY-MM-DD format"}), 400
    if done and completion_date is None:
        return jsonify({"error": "A completed stage requires a date"}), 400
    if not done and completion_date is not None:
        return jsonify({"error": "An incomplete stage cannot have a date"}), 400

    document = get_firestore_client().collection(COLLECTION_NAME).document(document_id)
    if not document.get().exists:
        return jsonify({"error": "Installation not found"}), 404

    completion = {"done": done, "date": completion_date}
    document.update({f"completion.{stage}": completion})
    update_cached_completion(document_id, stage, completion)
    return jsonify({"id": document_id, "stage": stage, **completion})


@app.patch("/api/installations/<document_id>/details")
def update_details(document_id: str) -> Any:
    if not DOCUMENT_ID_PATTERN.fullmatch(document_id):
        return jsonify({"error": "Invalid installation"}), 404

    payload = request.get_json(silent=True) or {}
    allowed_fields = {"actual_cutted_pixel", "remarks"}
    if not payload or not set(payload).issubset(allowed_fields):
        return jsonify({"error": "Only Actual Cut and Remarks can be updated"}), 400

    updates: dict[str, int | str | None] = {}
    if "actual_cutted_pixel" in payload:
        actual_cut = payload["actual_cutted_pixel"]
        if actual_cut is not None:
            if isinstance(actual_cut, bool) or not isinstance(actual_cut, int):
                return jsonify({"error": "Actual Cut must be a whole number"}), 400
            if not 0 <= actual_cut <= MAX_INT64:
                return jsonify({"error": "Actual Cut is outside the int64 range"}), 400
        updates["actual_cutted_pixel"] = actual_cut

    if "remarks" in payload:
        remarks = payload["remarks"]
        if remarks is not None and not isinstance(remarks, str):
            return jsonify({"error": "Remarks must be text"}), 400
        remarks = remarks.strip() if remarks else None
        if remarks is not None and len(remarks) > MAX_REMARKS_LENGTH:
            return jsonify({"error": "Remarks cannot exceed 1000 characters"}), 400
        updates["remarks"] = remarks

    document = get_firestore_client().collection(COLLECTION_NAME).document(document_id)
    if not document.get().exists:
        return jsonify({"error": "Installation not found"}), 404

    document.update(updates)
    update_cached_installation(document_id, updates)
    return jsonify({"id": document_id, **updates})


if __name__ == "__main__":
    app.run(debug=True)