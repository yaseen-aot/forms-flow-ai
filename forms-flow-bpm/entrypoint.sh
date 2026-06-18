#!/bin/sh
# Patch mail-config.properties inside the JAR with actual env var values
# camunda-bpm-mail-core uses Properties.load() directly — ${VAR} is not resolved automatically.

JAR=/app/forms-flow-bpm.jar
PROPS=BOOT-INF/classes/mail-config.properties
TMP=/tmp/mail-config.properties

# Extract the properties file from the JAR
unzip -p "$JAR" "$PROPS" > "$TMP"

# Substitute placeholders with actual env values
sed -i "s|\${MAIL_USER}|${MAIL_USER}|g" "$TMP"
sed -i "s|\${MAIL_PASSWORD}|${MAIL_PASSWORD}|g" "$TMP"

# Update the JAR in-place with the patched file
cd /tmp && zip -u "$JAR" "$PROPS" << 'EOF'
EOF
# zip needs the file at the same relative path
mkdir -p /tmp/BOOT-INF/classes
cp "$TMP" /tmp/BOOT-INF/classes/mail-config.properties
cd /tmp && zip -u "$JAR" BOOT-INF/classes/mail-config.properties

echo "mail-config.properties patched with MAIL_USER=${MAIL_USER}"

# Start the application
exec java \
  -Djava.security.egd=file:/dev/./urandom \
  -Dpolyglot.js.nashorn-compat=true \
  -Dpolyglot.engine.WarnInterpreterOnly=false \
  -Dloader.path=/app/plugins \
  -cp /app/forms-flow-bpm.jar \
  org.springframework.boot.loader.launch.PropertiesLauncher
