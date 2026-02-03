# Forms Flow ImmuDB Worker Service
FROM python:3.12-slim-bookworm

# Set label for image
LABEL Name="formsflow-immudb"
LABEL Description="ImmuDB audit logging and reporting worker service"

WORKDIR /forms-flow-immudb/app

# Install minimal dependencies
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better layer caching
COPY requirements.txt .

# Set up virtual environment
ENV PATH=/venv/bin:$PATH

RUN python3 -m venv /venv \
    && pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Copy application code
ADD . /forms-flow-immudb/app

# Install the package
RUN pip install --no-cache-dir -e . \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf ~/.cache/pip

# Create logs directory with proper permissions
RUN mkdir -p /forms-flow-immudb/app/logs \
    && chmod -R 777 /forms-flow-immudb/app/logs

# Expose the service port
EXPOSE 5001

# Copy and set up entrypoint
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/bin/sh", "/entrypoint.sh"]
