"""Main Flask application for the ImmuDB worker service."""

import logging
import sys
from pathlib import Path
from flask import Flask, jsonify
from flask_cors import CORS

from .config import Config, get_config
from .api.audit_api import audit_bp
from .resources.report import REPORT
from .services.immudb_service import ImmudbService


def setup_logging(app):
    """Configure application logging."""
    log_level = getattr(logging, app.config['LOG_LEVEL'].upper(), logging.INFO)
    
    # Create formatter
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    
    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(log_level)
    console_handler.setFormatter(formatter)
    
    # File handler
    log_dir = app.config.get('LOG_DIR', Path(__file__).parent.parent.parent / 'logs')
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / 'worker.log'
    
    file_handler = logging.FileHandler(log_file)
    file_handler.setLevel(log_level)
    file_handler.setFormatter(formatter)
    
    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)
    root_logger.addHandler(console_handler)
    root_logger.addHandler(file_handler)
    
    # Set application logger level
    app.logger.setLevel(log_level)
    app.logger.info(f"Logging configured at {log_level} level")
    app.logger.info(f"Log file: {log_file}")


def create_app(config_name: str = None):
    """Create and configure the Flask application.
    
    Args:
        config_name: Configuration name (development, production, testing)
    
    Returns:
        Flask application instance
    """
    app = Flask(__name__)
    
    # Load configuration
    config_class = get_config(config_name)
    app.config.from_object(config_class)
    
    # Validate configuration
    try:
        config_class.validate()
    except ValueError as e:
        print(f"Configuration error: {e}")
        sys.exit(1)
    
    # Setup logging
    setup_logging(app)
    app.logger.info("Starting Forms Flow ImmuDB Worker Service")
    
    # Setup CORS
    cors_origins = app.config['CORS_ORIGINS']
    if cors_origins == '*':
        CORS(app, origins='*')
        app.logger.warning("CORS enabled for all origins (not recommended for production)")
    else:
        origins_list = [origin.strip() for origin in cors_origins.split(',')]
        CORS(app, origins=origins_list)
        app.logger.info(f"CORS enabled for origins: {origins_list}")
    
    # Initialize ImmuDB service
    with app.app_context():
        try:
            app.logger.info("Initializing ImmuDB service...")
            ImmudbService.get_instance()
            app.logger.info("ImmuDB service initialized successfully")
        except Exception as e:
            app.logger.error(f"Failed to initialize ImmuDB service: {e}")
            if not app.config['DEBUG']:
                app.logger.error("Exiting due to initialization failure")
                sys.exit(1)
    
    # Register blueprints
    api_prefix = app.config['API_PREFIX']
    
    app.logger.info(f"Registering audit API blueprint at {api_prefix}")
    app.register_blueprint(audit_bp, url_prefix=api_prefix)
    
    app.logger.info(f"Registering report blueprint at /report")
    app.register_blueprint(REPORT, url_prefix="/report")
    
    # Root health check endpoint
    @app.route('/')
    def index():
        """Root endpoint."""
        return jsonify({
            'service': 'forms-flow-immudb',
            'version': '1.0.0',
            'status': 'running',
            'endpoints': {
                'health': '/health',
                'audit_api': f"{api_prefix}/audit/log",
                'query': f"{api_prefix}/audit/query",
                'report': "/report/"
            }
        }), 200
    
    @app.route('/health')
    def health():
        """Health check endpoint for monitoring."""
        try:
            service = ImmudbService.get_instance()
            return jsonify({
                'status': 'healthy',
                'service': 'forms-flow-immudb',
                'version': '1.0.0',
                'immudb_enabled': service.enabled
            }), 200
        except Exception as e:
            app.logger.error(f"Health check failed: {e}")
            return jsonify({
                'status': 'unhealthy',
                'service': 'forms-flow-immudb',
                'error': str(e)
            }), 503
    
    # Error handlers
    @app.errorhandler(404)
    def not_found(error):
        """Handle 404 errors."""
        return jsonify({
            'error': 'Not Found',
            'message': 'The requested resource was not found'
        }), 404
    
    @app.errorhandler(500)
    def internal_error(error):
        """Handle 500 errors."""
        app.logger.error(f"Internal server error: {error}")
        return jsonify({
            'error': 'Internal Server Error',
            'message': 'An unexpected error occurred'
        }), 500
    
    # Cleanup on shutdown
    @app.teardown_appcontext
    def shutdown_session(exception=None):
        """Cleanup on application shutdown only if not a health check."""
        # Optional: Add logic to skip shutdown on every health check if desired
        # For now, fixing the service shutdown logic itself is better.
        pass
    
    app.logger.info("Application initialization complete")
    return app


def main():
    """Main entry point for the application."""
    app = create_app()
    
    host = app.config['HOST']
    port = app.config['PORT']
    debug = app.config['DEBUG']
    
    print(f"\n{'='*60}")
    print(f"  Forms Flow ImmuDB Worker Service")
    print(f"{'='*60}")
    print(f"  Running on: http://{host}:{port}")
    print(f"  Debug mode: {debug}")
    print(f"  API prefix: {app.config['API_PREFIX']}")
    print(f"  ImmuDB: {'Enabled' if app.config['IMMUDB_ENABLED'] else 'Disabled'}")
    print(f"{'='*60}\n")
    
    app.run(
        host=host,
        port=port,
        debug=debug,
        use_reloader=debug
    )


if __name__ == '__main__':
    main()
