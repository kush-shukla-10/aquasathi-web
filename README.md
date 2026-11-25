# AquaSathi

AquaSathi is a farmer-first shrimp pond monitoring and incident investigation MVP. It brings pond records, water-quality screening, incident evidence, expert follow-up, and traceable aquaculture references into one responsive workspace.

## Run locally

Requirements: Node.js 20.19+ (or 22.12+) and Python 3.10+.

1. Start the API in a terminal:

   ```bash
   cd backend
   python -m venv .venv
   . .venv/bin/activate
   pip install -r requirements.txt
   cp .env.example .env
   uvicorn app.main:app --reload --env-file .env
   ```

   The API creates a local SQLite database (`backend/aquasathi.db`) and seeds three demonstration ponds on first start. API documentation is available at [http://localhost:8000/docs](http://localhost:8000/docs).

2. Start the web app in another terminal:

   ```bash
   cd web
   npm install
   npm run dev
   ```

   Open the Vite URL (normally [http://localhost:5173](http://localhost:5173)). Set `VITE_API_BASE` if the API is hosted somewhere other than `http://localhost:8000`.

3. Optional PostgreSQL: install dependencies as usual, then set `DATABASE_URL` to a PostgreSQL connection string, for example `postgresql://localhost/aquasathi`. The API normalizes this to the included psycopg driver. SQLite remains the zero-setup local default.

## MVP workflow

- Review pond health and distinguish simulated seed readings from actual measurements entered by a farmer.
- Add ponds and record dissolved oxygen, temperature, pH, salinity, and ammonia.
- Review broad demo screening flags, historical records, and stale or missing readings.
- Create an incident, attach an optional photo, and save the pond’s latest reading as investigation evidence.
- Record expert recommendations and track a case as open, monitoring, or resolved.
- Search locally stored reference summaries and follow citations to ICAR-CIBA, MPEDA, and FAO.
- Ask a general question in English, Telugu, or Hindi. Browser speech recognition/synthesis is used when available.

## Validation

```bash
# Frontend
cd web
npm run build
npm run lint

# Backend (from repository root)
cd backend
python -m unittest discover -s tests -v
```

## Architecture

```text
web/                  React + TypeScript + Vite + Tailwind CSS
backend/app/           FastAPI REST API, SQLAlchemy models, local reference search
backend/tests/         Monitoring, retrieval, and input-validation unit tests
```

The backend exposes `/api/dashboard`, `/api/ponds`, `/api/ponds/{id}/readings`, `/api/incidents`, `/api/incidents/{id}/reviews`, `/api/knowledge`, and `/api/assistant`. See the interactive OpenAPI documentation at `/docs`.

## Demo boundaries and safety

- Seed readings are marked simulated and are never described as sensor measurements. Demo screening thresholds are broad prompts to review data, not husbandry prescriptions.
- The reference search retrieves text from a small bundled set; it is not an embeddings/vector database or a generative AI model. Replies explicitly disclose that limitation, cite matched sources, and avoid diagnosing an individual pond.
- Image files are stored locally with incident reports, but no vision model is connected. The app does not infer a disease from an image.
- Telugu/Hindi voice input and audio playback depend on browser Web Speech API support; typed questions remain available.
- The expert desk is a local review workflow, not a notification service or a verified expert network.
- Authentication, role-based access enforcement, production PostgreSQL migrations, sensor integrations, external AI, and deployment configuration are not included. Do not use this MVP for urgent animal-health decisions or as a substitute for qualified local advice.

The local database and uploaded images are created at runtime and should not be committed.
