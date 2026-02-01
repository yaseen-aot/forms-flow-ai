"""Basic tests for the ImmuDB service."""

import pytest
from src.formsflow_immudb.services.immudb_service import ImmudbService


def test_service_disabled():
    """Test service behavior when disabled."""
    config = {'IMMUDB_ENABLED': False}
    service = ImmudbService(config)
    
    assert service.enabled is False
    assert service.log_event(None, 'test', None, {}, {}) is False


def test_service_instance():
    """Test singleton instance pattern."""
    instance1 = ImmudbService.get_instance({'IMMUDB_ENABLED': False})
    instance2 = ImmudbService.get_instance()
    
    assert instance1 is instance2
