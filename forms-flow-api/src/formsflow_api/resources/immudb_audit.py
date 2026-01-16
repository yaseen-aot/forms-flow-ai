import functools
import inspect
import json
from typing import Callable, Iterable

from flask import current_app

from formsflow_api.services.ehr.immudb_service import ImmudbService


def _extract_request_from_args_kwargs(args, kwargs):
    # heuristic: prefer kw 'data' or 'payload' else first dict-like arg
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
    """Extract tenant from multiple sources in priority order."""
    # Priority 1: Explicit tenant_key in kwargs (set by function)
    tenant = kwargs.get("tenant_key")
    if tenant:
        return tenant
    
    # Priority 2: User context tenant_key
    tenant = getattr(user, "tenant_key", None) if user else None
    if tenant:
        return tenant
    
    # Priority 3: Request data tenant field
    if isinstance(request_data, dict):
        tenant = request_data.get("tenant") or request_data.get("tenant_key")
        if tenant:
            return tenant
    
    return None


def immudb_audit(event_name: str, index_keys: Iterable[str] | None = None, **kwargs):
    """Decorator to log request/response to immudb.
    - event_name: free-form name (e.g. 'submission','approval')
    - index_keys: list of response JSON keys to index for simple querying, e.g. ['approved','approval.approved']
    The decorated function can be sync or async, and may accept a `user` kwarg (UserContext) from existing @user_context.
    """
    def decorator(func: Callable):
        if inspect.iscoroutinefunction(func):

            @functools.wraps(func)
            async def async_wrapper(*args, **kwargs):
                req = _extract_request_from_args_kwargs(args, kwargs)
                user = kwargs.get("user")
                
                # Extract tenant from multiple sources
                tenant = _extract_tenant(user, kwargs, req)
                user_id = getattr(user, "user_name", None) if user else None
                
                # Debug logging to verify tenant is being captured
                if tenant:
                    current_app.logger.debug(f"ImmuDB audit capturing tenant: {tenant} for event: {event_name}")
                else:
                    current_app.logger.warning(f"ImmuDB audit - No tenant found for event: {event_name}")
                
                svc = ImmudbService.get_instance()
                try:
                    res = await func(*args, **kwargs)
                    # For functions that return (result, status), try to pick the payload
                    payload = res[0] if isinstance(res, (list, tuple)) and len(res) >= 1 else res
                    # normalize to dict if possible
                    try:
                        body = payload if isinstance(payload, dict) else json.loads(json.dumps(payload, default=str))
                    except Exception:
                        body = {"result": str(payload)}
                    
                    # Final fallback: Try to extract tenant from response if still not found
                    if not tenant and isinstance(body, dict):
                        tenant = body.get("tenant") or body.get("tenant_key")
                        if tenant:
                            current_app.logger.debug(f"ImmuDB audit extracted tenant from response: {tenant}")
                            
                except Exception as exc:
                    # log exception response - ensure tenant is captured even on error
                    svc.log_event(tenant, event_name, user_id, req, {"error": str(exc)}, index_keys)
                    raise
                svc.log_event(tenant, event_name, user_id, req, body, index_keys)
                return res

            return async_wrapper

        else:

            @functools.wraps(func)
            def wrapper(*args, **kwargs):
                req = _extract_request_from_args_kwargs(args, kwargs)
                user = kwargs.get("user")
                
                # Extract tenant from multiple sources
                tenant = _extract_tenant(user, kwargs, req)
                user_id = getattr(user, "user_name", None) if user else None
                
                # Debug logging to verify tenant is being captured
                if tenant:
                    current_app.logger.debug(f"ImmuDB audit capturing tenant: {tenant} for event: {event_name}")
                else:
                    current_app.logger.warning(f"ImmuDB audit - No tenant found for event: {event_name}")
                
                svc = ImmudbService.get_instance()
                try:
                    res = func(*args, **kwargs)
                    payload = res[0] if isinstance(res, (list, tuple)) and len(res) >= 1 else res
                    try:
                        body = payload if isinstance(payload, dict) else json.loads(json.dumps(payload, default=str))
                    except Exception:
                        body = {"result": str(payload)}
                    
                    # Final fallback: Try to extract tenant from response if still not found
                    if not tenant and isinstance(body, dict):
                        tenant = body.get("tenant") or body.get("tenant_key")
                        if tenant:
                            current_app.logger.debug(f"ImmuDB audit extracted tenant from response: {tenant}")
                            
                except Exception as exc:
                    # log exception response - ensure tenant is captured even on error
                    svc.log_event(tenant, event_name, user_id, req, {"error": str(exc)}, index_keys)
                    raise
                svc.log_event(tenant, event_name, user_id, req, body, index_keys)
                return res

            return wrapper

    return decorator