"""Tests for /ws/gui broadcast behavior (Phase 2C Stage 2C-3g-2).

Verifies:
  - GUI clients receive live_state from /ws/device
  - Non-live_state messages are NOT broadcast
  - /ws/gui does not send unsolicited messages
  - Dead GUI clients are pruned on broadcast failure
"""

import json

import pytest
from fastapi.testclient import TestClient

from pc import db as pc_db
from pc.server import app, _gui_clients, _gui_lock, init_persistence
from pc.tests.test_protocol import CLIENT as device_client

GUI_CLIENT = TestClient(app)
WS_GUI_PATH = "/ws/gui"
WS_DEVICE_PATH = "/ws/device"


def _make_live_state(station_id=1, station_count=1, alarm_state="inactive",
                     warning_state="inactive", data_loss_pending=False):
    return {
        "protocol_version": "1.1.1",
        "type": "live_state",
        "message_id": "esp32-01:<boot_id>:1",
        "device_id": "esp32-01",
        "boot_id": "<boot_id>",
        "seq": 1,
        "ts_sent_ms": 0,
        "ts_sent_valid": 1,
        "payload": {
            "event_time": 0,
            "event_time_valid": 1,
            "stations": [{
                "station_id": station_id,
                "nozzles": [{
                    "nozzle_id": 1,
                    "raw_pressure_voltage": 0,
                    "raw_temperature_voltage": 0,
                    "converted_pressure": None,
                    "converted_temperature": None,
                    "channel_state": "valid",
                }],
            }],
            "station_count": station_count,
            "invalid_channel_count_now": 0,
            "volatile_loss_counter": 0,
            "data_loss_pending": data_loss_pending,
            "journal_pressure_indicator": False,
            "alarm_state": alarm_state,
            "warning_state": warning_state,
        },
    }


def _make_cycle_summary(record_id="r1", record_seq=1):
    return {
        "protocol_version": "1.1.1",
        "type": "cycle_summary",
        "message_id": f"esp32-01:<boot_id>:{record_seq}",
        "device_id": "esp32-01",
        "boot_id": "<boot_id>",
        "seq": record_seq,
        "ts_sent_ms": 0,
        "ts_sent_valid": 1,
        "record_id": record_id,
        "record_seq": record_seq,
        "payload": {
            "station_id": 1,
            "nozzles": [{
                "nozzle_id": 1,
                "valid_samples_pressure": 0,
                "valid_samples_temperature": None,
                "temp_conversion_configured": False,
                "pressure_avg": None,
                "pressure_min": None,
                "pressure_max": None,
                "temperature_avg": None,
                "temperature_min": None,
                "temperature_max": None,
            }],
            "cycle_start_ms": 0,
            "start_time_valid": 1,
            "cycle_end_ms": 0,
            "end_time_valid": 1,
            "duration_ms": 0,
            "duration_basis": "calendar",
            "faulted_channel_count": 0,
            "fault_transition_count": None,
            "valid_samples_pressure_both_nozzles": None,
            "valid_samples_temperature_both_nozzles": None,
        },
    }


class TestGuiWebSocket:
    """Test /ws/gui broadcast behavior using TestClient."""

    def test_gui_receives_live_state_from_device(self, tmp_path):
        """A GUI client receives live_state sent on /ws/device."""
        import pc.server as server
        db_path = str(tmp_path / "test.db")
        server._db_conn = None
        server._gui_clients.clear()
        conn = pc_db.open_db(db_path)
        pc_db.init_db(conn)
        server._db_conn = conn
        try:
            with GUI_CLIENT.websocket_connect(WS_GUI_PATH) as gui_ws:
                with device_client.websocket_connect(WS_DEVICE_PATH) as device_ws:
                    message = _make_live_state()
                    device_ws.send_json(message)
                    received = gui_ws.receive_json()
                    assert received["type"] == "live_state"
                    assert received["payload"]["alarm_state"] == "inactive"
        finally:
            server._db_conn = None
            server._gui_clients.clear()
            conn.close()

    def test_non_live_state_not_broadcast_to_gui(self, tmp_path):
        """A durable record is NOT broadcast to /ws/gui."""
        import pc.server as server
        db_path = str(tmp_path / "test.db")
        server._db_conn = None
        server._gui_clients.clear()
        conn = pc_db.open_db(db_path)
        pc_db.init_db(conn)
        server._db_conn = conn
        try:
            with GUI_CLIENT.websocket_connect(WS_GUI_PATH) as gui_ws:
                with device_client.websocket_connect(WS_DEVICE_PATH) as device_ws:
                    message = _make_cycle_summary()
                    device_ws.send_json(message)
                    device_ws.receive_json()
            assert len(server._gui_clients) == 0
        finally:
            server._db_conn = None
            server._gui_clients.clear()
            conn.close()

    def test_gui_does_not_send_unsolicited(self, tmp_path):
        """A fresh GUI client receives nothing until a device sends."""
        import pc.server as server
        db_path = str(tmp_path / "test.db")
        server._db_conn = None
        server._gui_clients.clear()
        conn = pc_db.open_db(db_path)
        pc_db.init_db(conn)
        server._db_conn = conn
        try:
            with GUI_CLIENT.websocket_connect(WS_GUI_PATH) as gui_ws:
                with device_client.websocket_connect(WS_DEVICE_PATH) as device_ws:
                    message = _make_cycle_summary()
                    device_ws.send_json(message)
                    device_ws.receive_json()
            assert len(server._gui_clients) == 0
        finally:
            server._db_conn = None
            server._gui_clients.clear()
            conn.close()

    def test_dead_gui_client_pruned(self, tmp_path):
        """A GUI client that raises during send is removed from the set."""
        import pc.server as server
        db_path = str(tmp_path / "test.db")
        server._db_conn = None
        server._gui_clients.clear()
        conn = pc_db.open_db(db_path)
        pc_db.init_db(conn)
        server._db_conn = conn
        try:
            gui_ws = GUI_CLIENT.websocket_connect(WS_GUI_PATH).__enter__()
            with device_client.websocket_connect(WS_DEVICE_PATH) as device_ws:
                message = _make_live_state()
                device_ws.send_json(message)
                gui_ws.close()
                import time
                time.sleep(0.1)
            assert len(server._gui_clients) == 0
            gui_ws.__exit__(None, None, None)
        finally:
            server._db_conn = None
            server._gui_clients.clear()
            conn.close()
