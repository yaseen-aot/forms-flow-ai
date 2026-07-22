# Forms Flow ImmuDB Worker - Quick Start Guide

## Prerequisites

1. **Python 3.9+** installed
2. **ImmuDB** running on `localhost:3322`
   - If not installed:
     ```bash
     docker run -d -p 3322:3322 --name immudb codenotary/immudb:latest
     ```

## Installation Steps

### 1. Navigate to Worker Directory
```powershell
cd d:\forms-flow-ai\forms-flow-immudb
```

### 2. Create Virtual Environment
```powershell
python -m venv venv
```

### 3. Activate Virtual Environment
```powershell
.\venv\Scripts\activate
```

### 4. Install Dependencies
```powershell
pip install -r requirements.txt
```

### 5. Verify Configuration
Check the `.env` file and ensure settings are correct:
```
IMMUDB_ENABLED=true
IMMUDB_HOST=localhost:3322
IMMUDB_USER=immudb
IMMUDB_PASS=immudb
PORT=5001
```

### 6. Run the Worker Service
```powershell
python -m src.formsflow_immudb.app
```

You should see:
```
============================================================
  Forms Flow ImmuDB Worker Service
============================================================
  Running on: http://0.0.0.0:5001
  Debug mode: False
  API prefix: /api/v1
  ImmuDB: Enabled
============================================================
```

## Testing the Service

### 1. Health Check
```powershell
curl http://localhost:5001/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "forms-flow-immudb",
  "immudb_enabled": true
}
```

### 2. Test Audit Logging
```powershell
curl -X POST http://localhost:5001/api/v1/audit/log `
  -H "Content-Type: application/json" `
  -d '{
    "tenant_id": "test-tenant",
    "event_name": "test_event",
    "user_id": "test-user",
    "request_data": {"action": "create"},
    "response_data": {"id": "123", "status": "success"},
    "index_keys": ["id", "status"]
  }'
```

Expected response:
```json
{
  "status": "success",
  "message": "Event logged successfully"
}
```

### 3. View Reports
Open in browser:
```
http://localhost:5001/api/v1/report/
```

## Integration with formsflow_api

### 1. Add Environment Variables to formsflow_api
Add these to your `forms-flow-api/.env` file:
```bash
IMMUDB_WORKER_ENABLED=true
IMMUDB_WORKER_URL=http://localhost:5001/api/v1
IMMUDB_WORKER_TIMEOUT=5
```

### 2. Restart formsflow_api
After adding the environment variables, restart your formsflow_api service.

### 3. Verify Dual-Write
When you create an application or perform any audited action in formsflow_api, both systems should log:
- Direct ImmuDB (existing)
- Worker service (new)

Check the logs for messages like:
```
Successfully logged event to worker: create_application
```

## Troubleshooting

### Worker won't start
- **Check ImmuDB**: Ensure ImmuDB is running on port 3322
- **Check Port**: Make sure port 5001 is not in use
- **Check Logs**: Look at `logs/worker.log` for errors

### Can't connect to ImmuDB
```powershell
# Test ImmuDB connection
docker ps | findstr immudb

# Restart ImmuDB if needed
docker restart immudb
```

### Worker client errors in formsflow_api
- **Check URL**: Verify `IMMUDB_WORKER_URL` is correct
- **Check Worker**: Ensure worker service is running
- **Check Network**: Make sure services can communicate

## Running Tests

```powershell
# Activate virtual environment
.\venv\Scripts\activate

# Run all tests
pytest tests/

# Run with coverage
pytest --cov=src tests/

# Run specific test
pytest tests/test_api.py
```

## Production Deployment

For production use with gunicorn:
```powershell
gunicorn -w 4 -b 0.0.0.0:5001 "src.formsflow_immudb.app:create_app()"
```

## Next Steps

1. ✅ Worker service is running
2. ✅ Health check passes
3. ✅ Can log events
4. ✅ Reports display correctly
5. ⬜ Integrated with formsflow_api
6. ⬜ Validated dual-write consistency
7. ⬜ Ready for production

## Support

- See `README.md` for detailed documentation
- See `MIGRATION_PLAN.md` for complete migration strategy
- Check `logs/worker.log` for debugging
