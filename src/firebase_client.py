from __future__ import annotations

import json
import os

import firebase_admin
from firebase_admin import credentials, firestore
from google.cloud.firestore_v1.client import Client


def get_firestore_client() -> Client:
    """Return a client using a deployment secret or default credentials."""
    try:
        app = firebase_admin.get_app()
    except ValueError:
        service_account_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
        if service_account_json:
            service_account = json.loads(service_account_json)
            app = firebase_admin.initialize_app(credentials.Certificate(service_account))
        else:
            app = firebase_admin.initialize_app()

    return firestore.client(app=app)
