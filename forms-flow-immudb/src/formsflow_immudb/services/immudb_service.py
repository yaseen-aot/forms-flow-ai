"""ImmuDB service for audit logging with immutable storage."""

import json
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, List, Any

try:
    from immudb import ImmudbClient
except ImportError:
    ImmudbClient = None

logger = logging.getLogger(__name__)


class ImmudbService:
    """Singleton service for interacting with ImmuDB."""
    
    _instance = None

    @classmethod
    def get_instance(cls, config: Dict = None):
        """Get or create the singleton instance.
        
        Args:
            config: Optional configuration dictionary
            
        Returns:
            ImmudbService instance
        """
        if cls._instance is None:
            cls._instance = cls(config)
        return cls._instance

    def __init__(self, config: Dict = None):
        """Initialize ImmuDB service.
        
        Args:
            config: Configuration dictionary with ImmuDB settings
        """
        if config is None:
            # Import here to avoid circular dependency
            from ..config import Config
            config = {
                'IMMUDB_ENABLED': Config.IMMUDB_ENABLED,
                'IMMUDB_HOST': Config.IMMUDB_HOST,
                'IMMUDB_USER': Config.IMMUDB_USER,
                'IMMUDB_PASS': Config.IMMUDB_PASS,
            }
        
        self.enabled = self._parse_bool(config.get('IMMUDB_ENABLED', True))
        self.config = config
        self.client = None
        
        if not self.enabled:
            logger.info("ImmuDB service disabled via configuration")
            return
            
        if ImmudbClient is None:
            logger.warning(
                "immudb-py client not installed; disabling ImmuDB audit logs. "
                "Install with: pip install immudb-py"
            )
            self.enabled = False
            return
        
        try:
            self._connect()
            logger.info("ImmuDB service initialized successfully")
        except Exception as e:
            logger.error(f"Initial ImmuDB connection failed: {e}")
            # We don't disable here completely, will retry on use
            pass

    def _connect(self):
        """Establish or refresh the ImmuDB connection."""
        try:
            if self.client:
                try:
                    self.shutdown()
                except:
                    pass
                    
            host = self.config.get('IMMUDB_HOST', 'localhost:3322')
            user = self.config.get('IMMUDB_USER', 'immudb')
            password = self.config.get('IMMUDB_PASS', 'immudb')
            
            logger.info(f"Connecting to ImmuDB at {host}...")
            self.client = ImmudbClient(host)
            self.client.login(user, password)
            self._init_schema()
            return True
        except Exception as e:
            logger.error(f"Failed to connect to ImmuDB: {e}")
            self.client = None
            return False

    def _get_client(self):
        """Get an active ImmuDB client, reconnecting if necessary."""
        if not self.enabled:
            return None
            
        if self.client is None:
            self._connect()
            
        return self.client

    def _parse_bool(self, value: Any) -> bool:
        """Parse boolean value from various types."""
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            return value.lower() in ('true', '1', 'yes', 'on')
        return bool(value)

    def _init_schema(self):
        """Initialize database schema if it doesn't exist."""
        create_table_sql = """
        CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER AUTO_INCREMENT PRIMARY KEY,
            tenant_id VARCHAR,
            event_name VARCHAR,
            user_id VARCHAR,
            request_data VARCHAR,
            response_data VARCHAR,
            indexed_json VARCHAR,
            created_at VARCHAR
        )
        """
        
        try:
            self.client.sqlExec(create_table_sql)
            logger.debug("Audit logs table initialized")
        except Exception as e:
            # Table might already exist, which is fine
            logger.debug(f"Table initialization message: {e}")

    def shutdown(self):
        """Shutdown the ImmuDB client connection."""
        if hasattr(self, 'client') and self.client is not None:
            try:
                # Some versions might require close() or shutdown()
                if hasattr(self.client, 'shutdown'):
                    self.client.shutdown()
                elif hasattr(self.client, 'close'):
                    self.client.close()
                self.client = None
                logger.info("ImmuDB client shutdown successfully")
            except Exception as e:
                logger.warning(f"Error during ImmuDB shutdown: {e}")

    def _flatten_indexed(self, obj: Dict, keys: Optional[List[str]]) -> str:
        """Flatten specific keys from object for indexing.
        
        Args:
            obj: Dictionary object to extract keys from
            keys: List of keys to extract (supports nested keys with dot notation)
            
        Returns:
            Semicolon-separated string of key:value pairs
        """
        if not keys or not obj:
            return ""
        
        parts = []
        for k in keys:
            val = None
            cur = obj
            
            # Support nested keys like "approval.approved"
            for part in k.split("."):
                if not isinstance(cur, dict) or part not in cur:
                    cur = None
                    break
                cur = cur[part]
            
            val = cur
            if val is not None:
                # JSON-encode the value for consistent storage
                parts.append(f"{k}:{json.dumps(val, separators=(',', ':'))}")
        
        return ";".join(parts)

    def log_event(
        self,
        tenant_id: Optional[str],
        event_name: str,
        user_id: Optional[str],
        request_data: Any,
        response_data: Any,
        index_keys: Optional[List[str]] = None,
    ) -> bool:
        """Log an audit event to ImmuDB.
        
        Args:
            tenant_id: Tenant identifier
            event_name: Name of the event (e.g., 'create_application')
            user_id: User identifier
            request_data: Request payload (will be JSON-serialized)
            response_data: Response payload (will be JSON-serialized)
            index_keys: List of response keys to index for querying
            
        Returns:
            bool: True if logged successfully, False otherwise
        """
        if not self.enabled:
            logger.debug("ImmuDB disabled, skipping audit log")
            return False
        
        try:
            # Convert to strings, handling None values
            tenant_str = str(tenant_id) if tenant_id is not None else ''
            user_str = str(user_id) if user_id is not None else ''
            
            logger.debug(
                f"Logging event '{event_name}' for tenant_id='{tenant_str}', "
                f"user_id='{user_str}'"
            )
            
            # Serialize request and response data
            req_json = json.dumps(request_data, default=str, ensure_ascii=False)
            res_json = json.dumps(response_data, default=str, ensure_ascii=False)
            
            # Extract indexed fields from response
            try:
                indexed = self._flatten_indexed(
                    response_data if isinstance(response_data, dict) else {},
                    index_keys
                )
            except Exception as e:
                logger.warning(f"Failed to extract indexed fields: {e}")
                indexed = ""
            
            # Generate timestamp
            ts = datetime.now(timezone.utc).isoformat()
            
            client = self._get_client()
            if not client:
                return False

            # Use parameterized query to prevent SQL injection
            sql = """
            INSERT INTO audit_logs (
                tenant_id, event_name, user_id,
                request_data, response_data, indexed_json, created_at
            ) VALUES (
                @tenant_id, @event_name, @user_id,
                @request_data, @response_data, @indexed_json, @created_at
            )
            """
            
            params = {
                'tenant_id': tenant_str,
                'event_name': event_name,
                'user_id': user_str,
                'request_data': req_json,
                'response_data': res_json,
                'indexed_json': indexed,
                'created_at': ts
            }
            
            try:
                try:
                    client.sqlExec(sql, params)
                except (TypeError, AttributeError):
                    # Fallback for older immudb-py versions
                    logger.debug("Using fallback SQL execution")
                    sql_fallback = f"""
                    INSERT INTO audit_logs (
                        tenant_id, event_name, user_id,
                        request_data, response_data, indexed_json, created_at
                    ) VALUES (
                        '{tenant_str}', '{event_name}', '{user_str}',
                        '{req_json.replace("'", "''")}', '{res_json.replace("'", "''")}',
                        '{indexed.replace("'", "''")}', '{ts}'
                    )
                    """
                    client.sqlExec(sql_fallback)
            except Exception as e:
                # If RPC or channel closed, try to reconnect ONCE
                if "RPC" in str(e) or "Channel" in str(e):
                    logger.warning("ImmuDB channel closed, retrying connection...")
                    if self._connect():
                        self.client.sqlExec(sql, params)
                        logger.info("Retry successful after reconnection")
                        return True
                raise e
            
            logger.debug(f"Successfully logged event to ImmuDB: {event_name}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to log event to ImmuDB: {e}", exc_info=True)
            # Don't crash the application if logging fails
            return False

    def query_logs(
        self,
        tenant_id: Optional[str] = None,
        event_name: Optional[str] = None,
        user_id: Optional[str] = None,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        limit: int = 100,
        offset: int = 0
    ) -> List[tuple]:
        """Query audit logs with filters.
        
        Args:
            tenant_id: Filter by tenant ID
            event_name: Filter by event name
            user_id: Filter by user ID
            date_from: Filter by start date (ISO format)
            date_to: Filter by end date (ISO format)
            limit: Maximum number of results
            offset: Number of results to skip
            
        Returns:
            List of tuples containing log entries
        """
        if not self.enabled:
            logger.warning("ImmuDB disabled, cannot query logs")
            return []
        
        try:
            query = """
            SELECT id, tenant_id, event_name, user_id,
                   request_data, response_data, created_at
            FROM audit_logs
            WHERE 1=1
            """
            
            # Add filters
            if tenant_id:
                query += f" AND tenant_id = '{tenant_id}'"
            if event_name:
                query += f" AND event_name = '{event_name}'"
            if user_id:
                query += f" AND user_id = '{user_id}'"
            if date_from:
                query += f" AND created_at >= '{date_from}'"
            if date_to:
                query += f" AND created_at <= '{date_to}'"
            
            query += " ORDER BY created_at DESC"
            query += f" LIMIT {limit} OFFSET {offset}"
            
            client = self._get_client()
            if not client:
                return []

            logger.debug(f"Executing query: {query}")
            try:
                results = client.sqlQuery(query)
            except Exception as e:
                if "RPC" in str(e) or "Channel" in str(e):
                    logger.warning("ImmuDB channel closed during query, retrying...")
                    if self._connect():
                        results = self.client.sqlQuery(query)
                        return list(results)
                raise e
            
            return list(results)
            
        except Exception as e:
            logger.error(f"Failed to query audit logs: {e}", exc_info=True)
            return []

    def query_by_response_key(self, key: str, value: Any) -> List[tuple]:
        """Query logs by indexed response key.
        
        Args:
            key: The key to search for
            value: The value to match
            
        Returns:
            List of tuples containing matching log entries
        """
        if not self.enabled:
            return []
        
        try:
            # Encode value to match stored format
            val_encoded = json.dumps(value, separators=(",", ":"))
            like_pattern = f"%{key}:{val_encoded}%"
            
            query = f"""
            SELECT id, tenant_id, event_name, user_id,
                   request_data, response_data, created_at
            FROM audit_logs
            WHERE indexed_json LIKE '{like_pattern}'
            """
            
            results = self.client.sqlQuery(query)
            return list(results)
            
        except Exception as e:
            logger.error(f"Failed to query by response key: {e}", exc_info=True)
            return []
