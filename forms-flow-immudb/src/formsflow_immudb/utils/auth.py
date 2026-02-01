"""Authentication utilities for the ImmuDB worker service."""

import time
import functools
import logging
from flask import request, jsonify, current_app
from cryptography.fernet import Fernet

logger = logging.getLogger(__name__)

def require_auth(f):
    """Decorator to require Fernet-encrypted authentication token in header."""
    @functools.wraps(f)
    def decorated_function(*args, **kwargs):
        token = request.headers.get("X-Auth-Token")
        secret_key = current_app.config.get("IMMUDB_SECRET_KEY")

        if not secret_key:
            logger.error("IMMUDB_SECRET_KEY not configured on server!")
            return jsonify({"error": "Server configuration error"}), 500

        if not token:
            logger.warning("Missing X-Auth-Token header")
            return jsonify({"error": "Authentication token missing"}), 401

        try:
            fernet = Fernet(secret_key)
            # Decrypt the token
            decrypted_data = fernet.decrypt(token.encode(), ttl=60) # 60 seconds TTL
            # Note: fernet.decrypt with ttl=60 handles the timestamp check automatically 
            # if we encrypted the timestamp or just use the default fernet behavior 
            # which includes a timestamp in the token.
            
            # To be even more explicit, we can check a custom payload too if we wanted,
            # but Fernet's built-in TTL is very robust for this use case.
            
            return f(*args, **kwargs)
        except Exception as e:
            logger.warning(f"Invalid or expired authentication token: {e}")
            return jsonify({"error": "Invalid or expired authentication token"}), 401

    return decorated_function
