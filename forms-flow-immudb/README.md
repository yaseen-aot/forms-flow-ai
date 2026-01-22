# Forms Flow ImmuDB Worker Service

A standalone microservice for handling ImmuDB audit logging and reporting for the Forms Flow application.

## Overview

This service provides:
- RESTful API for audit event logging
- ImmuDB integration for immutable audit trails
- Web-based reporting interface
- Multi-tenant support
- High-performance querying and search

## Architecture

```
formsflow_api ──HTTP REST API──> forms-flow-immudb ──Native Client──> ImmuDB
(Main App)                       (Worker Service)                     (Database)
```

## Features

- ✅ Audit event logging with tenant isolation
- ✅ Batch event processing
- ✅ Advanced search and filtering
- ✅ Beautiful web-based report UI
- ✅ JSON viewer with collapsible tree
- ✅ RESTful API endpoints
- ✅ Health check monitoring
- ✅ CORS support for web integration

## Quick Start

### Prerequisites

- Python 3.9+
- ImmuDB running on localhost:3322 (or configure via environment)

### Installation

```bash
# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### Configuration

Copy `.env.example` to `.env` and configure:

```bash
# Flask Configuration
SECRET_KEY=your-secret-key-change-in-production
DEBUG=false
HOST=0.0.0.0
PORT=5001

# ImmuDB Configuration
IMMUDB_ENABLED=true
IMMUDB_HOST=localhost:3322
IMMUDB_USER=immudb
IMMUDB_PASS=immudb

# API Configuration
API_PREFIX=/api/v1
CORS_ORIGINS=*

# Logging Configuration
LOG_LEVEL=INFO
```

### Running the Service

```bash
# Development mode
python -m src.formsflow_immudb.app

# Production mode with gunicorn
gunicorn -w 4 -b 0.0.0.0:5001 "src.formsflow_immudb.app:create_app()"
```

## API Endpoints

### Health Check
```
GET /health
```

### Audit Logging
```
POST /api/v1/audit/log           - Log single audit event
POST /api/v1/audit/log/batch     - Log multiple audit events
GET  /api/v1/audit/query         - Query audit logs
GET  /api/v1/audit/search        - Search with filters
```

### Reporting
```
GET /api/v1/report/              - Web UI for viewing reports
GET /api/v1/report/api/search    - JSON API for reports
```

## API Usage Examples

### Log an Audit Event

```bash
curl -X POST http://localhost:5001/api/v1/audit/log \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "tenant-123",
    "event_name": "create_application",
    "user_id": "user@example.com",
    "request_data": {
      "form_id": "form-456",
      "data": {}
    },
    "response_data": {
      "id": "app-789",
      "status": "created"
    },
    "index_keys": ["id", "form_id", "tenant"]
  }'
```

### Query Audit Logs

```bash
curl "http://localhost:5001/api/v1/audit/query?tenant_id=tenant-123&event_name=create_application&limit=10"
```

## Testing

```bash
# Run all tests
pytest tests/

# Run with coverage
pytest --cov=src tests/

# Run specific test file
pytest tests/test_api.py
```

## Development

### Project Structure

```
forms-flow-immudb/
├── .env                          # Environment configuration
├── requirements.txt              # Python dependencies
├── setup.py                      # Package setup
├── README.md                     # This file
├── logs/                         # Application logs
├── tests/                        # Test suite
│   ├── __init__.py
│   ├── test_service.py
│   ├── test_api.py
│   └── test_integration.py
└── src/
    └── formsflow_immudb/
        ├── __init__.py
        ├── app.py               # Main Flask application
        ├── config.py            # Application configuration
        ├── services/
        │   ├── __init__.py
        │   └── immudb_service.py    # Core ImmuDB service
        ├── resources/
        │   ├── __init__.py
        │   └── report.py        # Report Blueprint
        └── api/
            ├── __init__.py
            └── audit_api.py     # RESTful API endpoints
```

## Integration with Forms Flow API

The Forms Flow API integrates with this service via HTTP calls:

```python
from formsflow_api.services.ehr.immudb_client import ImmudbWorkerClient

client = ImmudbWorkerClient('http://localhost:5001/api/v1')
client.log_event(
    tenant_id='tenant-123',
    event_name='create_application',
    user_id='user@example.com',
    request_data={'form_id': 'form-456'},
    response_data={'id': 'app-789', 'status': 'created'},
    index_keys=['id', 'form_id', 'tenant']
)
```

## Monitoring

Health check endpoint for monitoring:

```bash
curl http://localhost:5001/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "forms-flow-immudb"
}
```

## Deployment

### Docker

```bash
# Build image
docker build -t forms-flow-immudb:latest .

# Run container
docker run -d \
  -p 5001:5001 \
  --env-file .env \
  --name immudb-worker \
  forms-flow-immudb:latest
```

### Docker Compose

See `docker-compose.yml` for a complete setup including ImmuDB.

## Troubleshooting

### Connection Issues

If you see connection errors:
1. Ensure ImmuDB is running: `docker ps | grep immudb`
2. Check ImmuDB host/port in `.env`
3. Verify network connectivity

### Permission Issues

If you see permission errors:
1. Check ImmuDB credentials in `.env`
2. Verify user has access to the database

### Performance Issues

If experiencing slow responses:
1. Check ImmuDB query performance
2. Consider adding indexes
3. Review log levels (set to ERROR in production)

## License

Copyright (c) 2024 AOT Technologies

## Support

For issues and questions, please contact the development team.
