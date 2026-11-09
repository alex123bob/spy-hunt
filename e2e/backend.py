"""Throwaway back end for e2e: only the spy-hunt blueprint, fake LLM, temp DB."""
import os
import sys
import tempfile

sys.path.insert(0, os.environ["BACKEND_DIR"])
os.environ.setdefault("SPY_HUNT_FAKE_LLM", "1")
os.environ.setdefault("SPY_HUNT_DB_PATH", os.path.join(tempfile.mkdtemp(), "e2e.db"))

from flask import Flask  # noqa: E402

from ai_svc.spy_hunt import spy_hunt_bp  # noqa: E402

from ai_svc.spy_hunt import db, puzzles  # noqa: E402
from ai_svc.spy_hunt.tests.puzzle_fixtures import sample_puzzle  # noqa: E402

db.init_db()
puzzles.insert_ready(*sample_puzzle(), 2, "p-e2e")  # spy is seat 2 (Pip), spy word "organ" (option 0)

app = Flask(__name__)
app.register_blueprint(spy_hunt_bp)

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.environ.get("E2E_API_PORT", "8010")), threaded=True)
