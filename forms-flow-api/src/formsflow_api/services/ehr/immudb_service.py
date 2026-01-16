import json
from datetime import datetime, timezone
from flask import current_app

from . import config as ehr_config

try:
    from immudb import ImmudbClient
except Exception:  # immudb client optional at import time for tests
    ImmudbClient = None


class ImmudbService:
    _instance = None

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def __init__(self):
        cfg = current_app.config
        # Get the value from Flask config first, then fall back to ehr_config
        enabled = cfg.get("IMMUDB_ENABLED")
        if enabled is None:
            enabled = ehr_config.IMMUDB_ENABLED
        # If it's a string (from environment), convert to boolean
        elif isinstance(enabled, str):
            enabled = enabled.lower() == "true"
        
        self.enabled = enabled
        
        if not self.enabled:
            return
        if ImmudbClient is None:
            current_app.logger.warning(
                "immudb client not installed; disabling immudb audit logs."
            )
            # disable further immudb usage without raising to avoid crashing app
            self.enabled = False
            return
        host = cfg.get("IMMUDB_HOST", ehr_config.IMMUDB_HOST)
        user = cfg.get("IMMUDB_USER", ehr_config.IMMUDB_USER)
        password = cfg.get("IMMUDB_PASS", ehr_config.IMMUDB_PASS)
        self.client = ImmudbClient(host)
        self.client.login(user, password)
        # ensure table exists with correct schema
        create_tbl = """CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER AUTO_INCREMENT PRIMARY KEY,
            tenant_id VARCHAR,
            event_name VARCHAR,
            user_id VARCHAR,
            request_data VARCHAR,
            response_data VARCHAR,
            indexed_json VARCHAR,
            created_at VARCHAR
        )"""
        try:
            self.client.sqlExec(create_tbl)
        except Exception as e:
            current_app.logger.warning(f"Failed to create audit_logs table: {e}")
            # Table might already exist, which is fine

    def shutdown(self):
        if getattr(self, "client", None):
            self.client.shutdown()

    def _flatten_indexed(self, obj: dict, keys: list | None) -> str:
        if not keys or not obj:
            return ""
        parts = []
        for k in keys:
            # support nested keys like "approval.approved"
            val = None
            cur = obj
            for part in k.split("."):
                if not isinstance(cur, dict) or part not in cur:
                    cur = None
                    break
                cur = cur[part]
            val = cur
            if val is not None:
                parts.append(f"{k}:{json.dumps(val, separators=(',', ':'))}")
        return ";".join(parts)

    def log_event(
        self,
        tenant_id: str,
        event_name: str,
        user_id: str,
        request_data,
        response_data,
        index_keys: list | None = None,
    ):
        if not self.enabled:
            current_app.logger.debug("Immudb disabled, skipping audit log.")
            return
        try:
            # Ensure tenant_id is a string, not None - use empty string if None
            tenant_str = str(tenant_id) if tenant_id is not None else ''
            user_str = str(user_id) if user_id is not None else ''
            
            # Log what we're storing for debugging
            current_app.logger.debug(f"ImmuDB logging event '{event_name}' with tenant_id='{tenant_str}', user_id='{user_str}'")
            
            req_json = json.dumps(request_data, default=str, ensure_ascii=False)
            res_json = json.dumps(response_data, default=str, ensure_ascii=False)
            try:
                indexed = self._flatten_indexed(
                    response_data if isinstance(response_data, dict) else {}, index_keys
                )
            except Exception:
                indexed = ""
            # Store timestamp as ISO format string
            ts = datetime.now(timezone.utc).isoformat()
            
            # Use parameterized query to avoid SQL injection and properly handle special characters
            sql = """INSERT INTO audit_logs (tenant_id, event_name, user_id,
                request_data, response_data, indexed_json, created_at)
                VALUES (@tenant_id, @event_name, @user_id, @request_data, 
                @response_data, @indexed_json, @created_at)"""
            
            params = {
                'tenant_id': tenant_str,
                'event_name': event_name,
                'user_id': user_str,
                'request_data': req_json,
                'response_data': res_json,
                'indexed_json': indexed,
                'created_at': ts
            }
            
            # Check if immudb client supports parameterized queries
            # If not, fall back to string replacement with proper escaping
            try:
                self.client.sqlExec(sql, params)
            except (TypeError, AttributeError):
                # Fallback: use string replacement with proper escaping
                sql_fallback = f"""INSERT INTO audit_logs (tenant_id, event_name, user_id,
                    request_data, response_data, indexed_json, created_at)
                    VALUES ('{tenant_str}', '{event_name}', '{user_str}',
                    '{req_json.replace("'", "''")}',
                    '{res_json.replace("'", "''")}',
                    '{indexed.replace("'", "''")}',
                    '{ts}')"""
                self.client.sqlExec(sql_fallback)
                
            current_app.logger.debug(f"Successfully logged event to ImmuDB: {event_name}")
            
        except Exception as e:
            current_app.logger.error(f"Failed to log event to ImmuDB: {e}", exc_info=True)
            # Don't crash the API if ImmuDB logging fails

    def query_by_response_key(self, key: str, value) -> list:
        """Simple query helper that searches indexed_json for key:value JSON.
        Returns rows as tuples from immudb.sqlQuery.
        """
        if not self.enabled:
            return []
        # value should be JSON-encoded to match stored flattened format
        val_encoded = json.dumps(value, separators=(",", ":"))
        like = f"%{key}:{val_encoded}%"
        q = f"SELECT * FROM audit_logs WHERE indexed_json LIKE '{like}'"
        return list(self.client.sqlQuery(q))