"""Throwaway back end for e2e: only the spy-hunt blueprint, fake LLM, temp DB."""
import datetime
import json
import os
import random
import re
import sys
import tempfile

sys.path.insert(0, os.environ["BACKEND_DIR"])
os.environ.setdefault("SPY_HUNT_FAKE_LLM", "1")
os.environ.setdefault("SPY_HUNT_DB_PATH", os.path.join(tempfile.mkdtemp(), "e2e.db"))

from flask import Flask, jsonify  # noqa: E402

from ai_svc.spy_hunt import spy_hunt_bp  # noqa: E402

from ai_svc.spy_hunt import arena, db, fake_llm, puzzles  # noqa: E402
from ai_svc.spy_hunt.tests.puzzle_fixtures import sample_puzzle  # noqa: E402

db.init_db()

# Every spec reaches this backend from 127.0.0.1, so parallel specs share one per-IP
# `flood` budget and starve each other. Raise it in place (routes hold a reference to
# the limiter object); per-guest limits stay as in production.
from ai_svc.spy_hunt import ratelimits  # noqa: E402
ratelimits._LIMITERS["flood"].max_requests = 100_000
puzzles.insert_ready(*sample_puzzle(), 2, "p-e2e")  # spy is seat 2 (Pip), spy word "organ" (option 0)

app = Flask(__name__)
app.register_blueprint(spy_hunt_bp)


def _fake_bot(prompt):
    if "vote_for" in prompt:
        targets = json.loads(re.search(r"vote for: (\[[^\]]*\])", prompt).group(1))
        return {"vote_for": targets[0], "reason": ""}
    return {"statement": "hm, interesting"}


fake_llm.register("bot", _fake_bot)


@app.post("/e2e/arena-night")
def arena_night():
    res = arena.run_night(matches=1, rng=random.Random(1), log=lambda *a: None,
                          today=datetime.datetime.now(datetime.timezone.utc).date().isoformat())
    return jsonify(res)

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.environ.get("E2E_API_PORT", "8010")), threaded=True)
