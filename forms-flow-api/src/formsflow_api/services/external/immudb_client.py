"""Immudb Client Service.

This module consolidates the ImmuDB worker client functionality, including:
1. ImmudbService: A singleton client for the standalone ImmuDB worker.
2. immudb_audit: A decorator for logging API events to the worker.
3. report_blueprint: A Flask blueprint for redirecting report requests to the worker.
"""

import functools
import inspect
import json
import logging
import requests
from typing import Callable, Iterable
from cryptography.fernet import Fernet
from flask import Blueprint, current_app, redirect, request

# Initialize Logger
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# 1. ImmudbService Class
# ---------------------------------------------------------------------------

class ImmudbService:
    """Client for the separate ImmuDB worker service."""
    
    _instance = None

    @classmethod
    def get_instance(cls):
        """Get the singleton instance."""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def _get_auth_header(self):
        """Generate the encrypted authentication header."""
        secret_key = current_app.config.get("IMMUDB_SECRET_KEY")
        if not secret_key:
            logger.warning("IMMUDB_SECRET_KEY not configured. Request may fail.")
            return {}
        
        fernet = Fernet(secret_key)
        # Fernet tokens include a timestamp by default
        token = fernet.encrypt(b"immudb-worker-auth")
        return {"X-Auth-Token": token.decode()}

    def log_event(self, tenant_id, event_name, user_id, request_data, response_data, index_keys=None):
        """Log an event by calling the worker's REST API.
        
        Args:
            tenant_id (str): The tenant identifier.
            event_name (str): The name of the event.
            user_id (str): The user identifier.
            request_data (dict): Data from the request.
            response_data (dict): Data from the response.
            index_keys (list, optional): Keys to index.
        """
        try:
            worker_url = current_app.config.get("IMMUDB_WORKER_URL", "http://localhost:5001/api/v1")
            worker_enabled = current_app.config.get("IMMUDB_WORKER_ENABLED", True)
            
            if not worker_enabled:
                return False
                
            payload = {
                "tenant_id": tenant_id,
                "event_name": event_name,
                "user_id": user_id,
                "request_data": request_data,
                "response_data": response_data,
                "index_keys": index_keys
            }
            
            # Fire and forget / best effort with short timeout
            response = requests.post(
                f"{worker_url}/audit/log", 
                json=payload, 
                headers=self._get_auth_header(),
                timeout=2
            )
            return response.status_code in (200, 201)
            
        except Exception as e:
            logger.warning(f"Failed to log event to worker: {e}")
            return False

    def query_logs(self, **kwargs):
        """Query logs from the worker's REST API."""
        try:
            worker_url = current_app.config.get("IMMUDB_WORKER_URL", "http://localhost:5001/api/v1")
            response = requests.get(
                f"{worker_url}/audit/query", 
                params=kwargs, 
                headers=self._get_auth_header(),
                timeout=5
            )
            if response.status_code == 200:
                return response.json().get("results", [])
            return []
        except Exception as e:
            logger.warning(f"Failed to query worker: {e}")
            return []

# ---------------------------------------------------------------------------
# 2. immudb_audit Decorator
# ---------------------------------------------------------------------------

def _extract_request_from_args_kwargs(args, kwargs):
    """Extract request data from function arguments."""
    if "data" in kwargs:
        return kwargs["data"]
    if "payload" in kwargs:
        return kwargs["payload"]
    for v in kwargs.values():
        if isinstance(v, dict):
            return v
    for a in args:
        if isinstance(a, dict):
            return a
    return None

def _extract_tenant(user, kwargs, request_data):
    """Extract tenant from multiple sources."""
    tenant = kwargs.get("tenant_key")
    if tenant:
        return tenant
    
    tenant = getattr(user, "tenant_key", None) if user else None
    if tenant:
        return tenant
    
    if isinstance(request_data, dict):
        tenant = request_data.get("tenant") or request_data.get("tenant_key")
        if tenant:
            return tenant
    
    return None

def immudb_audit(event_name: str, index_keys: Iterable[str] | None = None, **kwargs):
    """Decorator to log request/response to separate ImmuDB worker.
    
    This client sends the log event via HTTP POST to the worker service.
    """
    def decorator(func: Callable):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            is_async = inspect.iscoroutinefunction(func)
            
            # Prepare audit data before execution
            req = _extract_request_from_args_kwargs(args, kwargs)
            user = kwargs.get("user")
            tenant = _extract_tenant(user, kwargs, req)
            user_id = getattr(user, "user_name", None) if user else None
            
            service = ImmudbService.get_instance()

            if is_async:
                # Async wrapper
                @functools.wraps(func)
                async def async_wrapper(*args, **kwargs):
                    try:
                        res = await func(*args, **kwargs)
                        # Extract result body
                        payload = res[0] if isinstance(res, (list, tuple)) and len(res) >= 1 else res
                        try:
                            body = payload if isinstance(payload, dict) else json.loads(json.dumps(payload, default=str))
                        except Exception:
                            body = {"result": str(payload)}
                        
                        # Log success
                        service.log_event(tenant, event_name, user_id, req, body, index_keys)
                        return res
                    except Exception as exc:
                        # Log error
                        service.log_event(tenant, event_name, user_id, req, {"error": str(exc)}, index_keys)
                        raise
                return async_wrapper
            else:
                # Sync wrapper
                try:
                    res = func(*args, **kwargs)
                    # Extract result body
                    payload = res[0] if isinstance(res, (list, tuple)) and len(res) >= 1 else res
                    try:
                        body = payload if isinstance(payload, dict) else json.loads(json.dumps(payload, default=str))
                    except Exception:
                        body = {"result": str(payload)}
                    
                    # Log success
                    service.log_event(tenant, event_name, user_id, req, body, index_keys)
                    return res
                except Exception as exc:
                    # Log error
                    service.log_event(tenant, event_name, user_id, req, {"error": str(exc)}, index_keys)
                    raise
        
        return wrapper
    return decorator
