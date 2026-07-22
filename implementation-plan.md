# Implementation Plan - Deploy formsflow.ai with ImmuDB and EHR Connectors

This plan details the steps required to deploy the complete **formsflow.ai** stack on Docker, build and mount the **ImmuDB Audit Plugin** to Camunda BPM, and run the **ImmuDB Worker** and **EHR Connector** microservices.

---

## Proposed Changes

### 1. Compile the ImmuDB Audit Plugin
Since Java 17 and Maven 3.8+ are not installed on the host machine, we will use a temporary Maven Docker container to build the plugin:
Run a Maven container to build the JAR:
 
bash
  docker run --rm -v "/Users/kesavgopan/Documents/GitHub/forms-flow-ai-EPIC/ehr_connectors/immudb-audit-plugin:/usr/src/mymaven" -w /usr/src/mymaven maven:3.8.1-openjdk-17-slim mvn clean package -DskipTests
 
Create the deployment/docker/plugins directory.
Copy the generated JAR to the plugins directory:
 
bash
  cp /Users/kesavgopan/Documents/GitHub/forms-flow-ai-EPIC/ehr_connectors/immudb-audit-plugin/target/immudb-audit-plugin-1.0.0-SNAPSHOT.jar /Users/kesavgopan/Documents/GitHub/forms-flow-ai-EPIC/deployment/docker/plugins/audit-plugin.jar

 

### 2. Configure and Run Keycloak
Keycloak serves as the Identity Provider (IDM) for formsflow.ai and must be started first:
Create the .env file:
 
bash
  cp /Users/kesavgopan/Documents/GitHub/forms-flow-ai-EPIC/forms-flow-idm/keycloak/sample.env /Users/kesavgopan/Documents/GitHub/forms-flow-ai-EPIC/forms-flow-idm/keycloak/.env
 
Start the database and Keycloak containers:
 
bash
  docker compose -f /Users/kesavgopan/Documents/GitHub/forms-flow-ai-EPIC/forms-flow-idm/keycloak/docker-compose.yml up -d
 

### 3. Configure and Run the ImmuDB Worker Service
The ImmuDB service provides tamper-proof auditing logs for the platform:
Generate a secure Fernet authentication key:
 
bash
  python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
 
Copy the environment configuration:
 
bash
  cp /Users/kesavgopan/Documents/GitHub/forms-flow-ai-EPIC/forms-flow-immudb/.env.example /Users/kesavgopan/Documents/GitHub/forms-flow-ai-EPIC/forms-flow-immudb/.env
 
Add the generated Fernet key as IMMUDB_SECRET_KEY in forms-flow-immudb/.env.
Start ImmuDB and the Flask service:
 
bash
  docker compose -f /Users/kesavgopan/Documents/GitHub/forms-flow-ai-EPIC/forms-flow-immudb/docker-compose.yml up -d
 

### 4. Configure and Run the Main formsflow.ai Stack
Copy the environment configuration:
 
bash
  cp /Users/kesavgopan/Documents/GitHub/forms-flow-ai-EPIC/deployment/docker/sample.env /Users/kesavgopan/Documents/GitHub/forms-flow-ai-EPIC/deployment/docker/.env
 
Replace {your-ip-address} with the host local IP: 192.168.1.98.
Set the ImmuDB audit integration settings in deployment/docker/.env using the generated Fernet secret key:
  * IMMUDB_WORKER_ENABLED=true
  * `IMMUDB_WORKER_URL=http://192.168.1.98:5001/api/v1`
  * IMMUDB_SECRET_KEY=<the_generated_fernet_key>
  * `IMMUDB_SERVICE_URL=http://192.168.1.98:5001/api/v1/audit/log`
  * IMMUDB_AUTH_TOKEN=<the_generated_fernet_key>
The `forms-flow-bpm/Dockerfile` is configured to copy `entrypoint.sh` as the default `ENTRYPOINT`. This script boots the application using `PropertiesLauncher` and automatically maps the container environment variables `${MAIL_USER}` and `${MAIL_PASSWORD}` to the JVM `-Dmail.user` and `-Dmail.password` properties. No manual `entrypoint` override is needed in the `docker-compose.yml` files.
 
Run the formsflow.ai deployment:
 
bash
  docker compose -f /Users/kesavgopan/Documents/GitHub/forms-flow-ai-EPIC/deployment/docker/docker-compose.yml up --build -d
 

### 5. Configure and Run the EHR Connector Service
Create a virtual environment and install dependencies:
 
bash
  cd /Users/kesavgopan/Documents/GitHub/forms-flow-ai-EPIC/ehr_connectors
  python3 -m venv venv
  source venv/bin/activate
  pip install -r requirements.txt
 
Generate the RSA-384 keys:
 
bash
  python generate_keys.py
 
Copy the environment configuration:
 
bash
  cp .env.example .env
 
Populate ehr_connectors/.env with the generated values printed by the generate_keys.py script.
Run the JWKS server and the main Epic connector API:
  * Run JWKS server: python jwks_server.py (served on port 8003)
  * Run EHR connector service: python -m src.main (served on port 8002)

---

## Verification Plan

### Automated Tests
In ehr_connectors virtualenv, run pytest test_connector.py.
In forms-flow-immudb virtualenv or environment, run pytest tests/ (with a running ImmuDB test setup).

### Manual Verification
Access Keycloak: [http://localhost:8080/auth](http://localhost:8080/auth)
Access Web UI: [http://localhost:3000](http://localhost:3000)
Verify ImmuDB Worker Health: [http://localhost:5001/health](http://localhost:5001/health)
Verify EHR Connector Health/Docs: [http://localhost:8002/docs](http://localhost:8002/docs)
Verify JWKS Key Distribution: [http://localhost:8003/.well-known/jwks.json](http://localhost:8003/.well-known/jwks.json)
Check Camunda logs to ensure the ImmuDB Audit Plugin successfully initialized:
 
bash
  docker logs forms-flow-bpm | grep "Immudb"