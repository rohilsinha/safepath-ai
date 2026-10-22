# Safety scoring service

The scorer uses only the Python standard library. No third-party Python
dependencies or Conda activation are required to run the service or its tests.

## Windows setup

From the repository root, use an installed Python 3.11+ interpreter to create
the local environment:

```powershell
& "<path-to-python.exe>" -m venv services\ai\.venv
```

Run tests and syntax compilation with the environment directly; do not activate
Conda or another environment:

```powershell
services\ai\.venv\Scripts\python.exe -m unittest discover -s services\ai\tests -v
services\ai\.venv\Scripts\python.exe -m compileall -q services\ai
```

Start the local scoring service from the repository root:

```powershell
services\ai\.venv\Scripts\python.exe -m services.ai.server
```

It binds to `127.0.0.1:8001` by default. Set `SAFETY_SCORING_PORT` to change
the port; if changed, set `SAFETY_SCORING_URL` for the NestJS API to the
corresponding `http://127.0.0.1:<port>/assess` URL. The health endpoint is
`GET /health`.

The same standard-library HTTP server also exposes
`POST /analyze-review`, used by the NestJS API for actual submitted
`SafetyReport.description` text. It accepts only a JSON object with a `text`
string (1-500 characters) and returns a versioned lexical sentiment result
and safety-relevance classification. It does not read fixtures or synthetic
demo reviews as production input.

`safepath-lexical` is a deterministic keyword heuristic, not a trained or
calibrated model. Its sentiment score is `(positive matches - negative
matches) / total sentiment matches` (-1 negative to +1 positive; 0 neutral;
no matches produces `UNCERTAIN` and score 0). Confidence values describe
heuristic support and are not probabilities. These outputs are attached only
as contextual evidence.
They are not converted into normalized risks and do not affect scoring weights,
risk boundaries, or insufficient-data behavior.

The currently installed interpreter used to bootstrap this workspace venv is
Python 3.13.9 from the machine's Anaconda installation. The `.venv` commands do
not require Conda activation, but Windows virtual environments use their base
Python installation at runtime. To remove even that base-install dependency,
install standalone Python 3.11+ and recreate `.venv` with its executable.

## Community-report integration and evidence limitations

The NestJS Maps service calls `POST /assess` once per route-calculation
request. Accepted, non-deleted community reports are matched to each actual
route segment after a bounded geographic/time prefilter. The default report
proximity is 100 metres and the default recency window is 30 days; configure
`COMMUNITY_REPORT_PROXIMITY_METERS` (1-1000) and
`COMMUNITY_REPORT_RECENCY_DAYS` (1-365) in the API environment to change them.

Accepted reports are user-submitted claims, not verified incidents. Their
counts and self-reported severity are not converted into a risk value.
Matching report categories, times, and proximity may be included as limited
context, but reports do not produce numerical scores.

For Stage 1 demos, the Maps service also matches a fixed, deterministic set of
explicitly synthetic indicators to the actual Mapbox route geometry. The sample
dataset uses two Chennai route-testing points: Chennai Central (longitude
80.2707, latitude 13.0827) and Egmore (longitude 80.2609, latitude 13.0788).
These approximate coordinates are selected as practical route-test locations;
the indicators do not represent real incidents or verified safety conditions.
Only the normalized category values belonging to matched demo indicators are
sent to the existing weighted scorer, separately for each route. Routes without
matched demo indicators retain
`insufficient_data`, a null score, and zero coverage. Routes with a calculated
score are labelled DEMO, show the categories and matched demo indicators that
contributed, and are ranked by score. Community reports remain separate and
cannot change that score. If the scoring service is unavailable, route
planning still returns the real Mapbox route and an `unavailable` null-score
assessment.

New submissions are accepted immediately for display as community information.
Users can soft-delete their own reports; deleted rows are excluded from route
context. Acceptance is not verification, and a submission or deletion does not
establish that an incident occurred.

Outside the clearly labelled demo area, only normalized risks supplied by a
future validated evidence pipeline can produce a numeric score. Demo values are
fixed and are never presented as real-world safety data.
